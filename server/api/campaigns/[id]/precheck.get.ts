import { db } from '~/server/db/index'
import { campaigns, contacts, listContacts, sends } from '~/server/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { contactMatchesTags } from '~/server/utils/segment'
import { getImapConfig } from '~/server/utils/bounce-processor'
import { checkDnsAuth, senderDomainFromEmail } from '~/server/utils/dns-check'

// Pre-send health check: returns a checklist the UI shows before sending.
// status: 'pass' | 'warn' | 'fail' — any 'fail' should block the send button.

export interface PrecheckItem {
  id: string
  status: 'pass' | 'warn' | 'fail'
  data?: Record<string, any>
}

const SPAM_WORDS = [
  // EN
  'free!!!', 'act now', 'buy now', 'click here', 'winner', 'guaranteed',
  'no obligation', 'risk-free', '100% free', 'cash bonus', 'earn money',
  'limited time', 'urgent', 'congratulations',
  // ES
  'gratis!!!', 'compre ya', 'haga clic aquí', 'ganador', 'garantizado',
  'sin compromiso', '100% gratis', 'gane dinero', 'urgente', 'felicidades',
  'oferta limitada', 'dinero fácil',
]

const GMAIL_CLIP_BYTES = 102 * 1024
const LINK_CHECK_MAX = 10
const LINK_CHECK_TIMEOUT_MS = 6000

// Live HTTP check of template links (HEAD, falling back to GET on 405).
// Template placeholders like {{url}} are skipped — they resolve per contact.
async function checkLinksAlive(urls: string[]): Promise<{ url: string; status: number | string }[]> {
  const unique = [...new Set(urls)]
    .filter(u => /^https?:\/\//i.test(u) && !/\{\{/.test(u))
    .slice(0, LINK_CHECK_MAX)

  const results = await Promise.all(unique.map(async (url) => {
    try {
      let res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TurboMailer-LinkCheck)' },
      })
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TurboMailer-LinkCheck)' },
        })
      }
      return { url, status: res.status }
    } catch {
      return { url, status: 'unreachable' as const }
    }
  }))

  return results.filter(r => r.status === 'unreachable' || (typeof r.status === 'number' && r.status >= 400))
}

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useServerConfig()

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  const items: PrecheckItem[] = []
  const html = campaign.templateHtml || ''
  const subject = campaign.subject || ''

  // ── Subject ──────────────────────────────────────────────────────────
  if (!subject.trim()) {
    items.push({ id: 'subject', status: 'fail' })
  } else if (subject.length > 78) {
    items.push({ id: 'subject_length', status: 'warn', data: { length: subject.length } })
  } else {
    items.push({ id: 'subject', status: 'pass' })
  }

  const lowerSubject = subject.toLowerCase()
  const spamHits = SPAM_WORDS.filter(w => lowerSubject.includes(w))
  const capsRatio = subject.length >= 10
    ? (subject.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / subject.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, '').length || 0)
    : 0
  if (spamHits.length || capsRatio > 0.6 || /!{2,}/.test(subject)) {
    items.push({ id: 'subject_spam', status: 'warn', data: { words: spamHits, caps: capsRatio > 0.6 } })
  } else if (subject.trim()) {
    items.push({ id: 'subject_spam', status: 'pass' })
  }

  // ── Template ─────────────────────────────────────────────────────────
  if (!html.trim()) {
    items.push({ id: 'template', status: 'fail' })
  } else {
    items.push({ id: 'template', status: 'pass' })

    // Unsubscribe link is a compliance requirement (CAN-SPAM / GDPR / RFC 8058)
    const hasUnsub = /\{\{\s*UNSUBSCRIBE_URL\s*\}\}/i.test(html)
    items.push({ id: 'unsubscribe', status: hasUnsub ? 'pass' : 'fail' })

    const sizeBytes = Buffer.byteLength(html, 'utf-8')
    items.push({
      id: 'size',
      status: sizeBytes > GMAIL_CLIP_BYTES ? 'warn' : 'pass',
      data: { kb: Math.round(sizeBytes / 1024) },
    })

    // Links: flag insecure http:// and localhost/dev URLs left in the template
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1])
    const insecure = hrefs.filter(h => /^http:\/\//i.test(h))
    const localhost = hrefs.filter(h => /^https?:\/\/(localhost|127\.|192\.168\.|10\.)/i.test(h))
    if (localhost.length) {
      items.push({ id: 'links', status: 'fail', data: { localhost: localhost.slice(0, 5) } })
    } else if (insecure.length) {
      items.push({ id: 'links', status: 'warn', data: { insecure: insecure.slice(0, 5) } })
    } else {
      items.push({ id: 'links', status: 'pass', data: { count: hrefs.length } })
    }

    // Live broken-link check (opt-in via ?live=1 — adds a few seconds)
    if (getQuery(event).live) {
      const external = hrefs.filter(h => /^https?:\/\//i.test(h))
      if (external.length) {
        const broken = await checkLinksAlive(external)
        items.push({
          id: 'links_live',
          status: broken.length ? 'warn' : 'pass',
          data: broken.length
            ? { broken: broken.map(b => `${b.url} (${b.status})`).slice(0, 5).join(', '), count: broken.length }
            : { count: Math.min(external.length, LINK_CHECK_MAX) },
        })
      }
    }
  }

  // ── Recipients ───────────────────────────────────────────────────────
  const tagFilter = Array.isArray(campaign.tagFilter) ? campaign.tagFilter : []
  let active = 0, filteredOut = 0
  const excluded = { unsubscribed: 0, bounced: 0, inactive: 0 }
  if (campaign.resendOfId) {
    // Follow-up campaign: recipients are the source campaign's unopened sends
    const rows = await db
      .select({ status: contacts.status, tags: contacts.tags })
      .from(contacts)
      .innerJoin(sends, and(
        eq(sends.contactId, contacts.id),
        eq(sends.campaignId, campaign.resendOfId),
        eq(sends.status, 'sent'),
      ))
    for (const r of rows) {
      if (r.status === 'active') {
        if (contactMatchesTags(r.tags, tagFilter)) active++
        else filteredOut++
      }
      else if (r.status === 'unsubscribed') excluded.unsubscribed++
      else if (r.status === 'bounced') excluded.bounced++
      else excluded.inactive++
    }
  } else if (campaign.listId) {
    const rows = await db
      .select({ status: contacts.status, tags: contacts.tags })
      .from(contacts)
      .innerJoin(listContacts, and(
        eq(listContacts.contactId, contacts.id),
        eq(listContacts.listId, campaign.listId),
      ))
    for (const r of rows) {
      if (r.status === 'active') {
        if (contactMatchesTags(r.tags, tagFilter)) active++
        else filteredOut++
      }
      else if (r.status === 'unsubscribed') excluded.unsubscribed++
      else if (r.status === 'bounced') excluded.bounced++
      else excluded.inactive++
    }
  }
  items.push({
    id: 'recipients',
    status: active > 0 ? 'pass' : 'fail',
    data: { active, ...excluded },
  })
  if (tagFilter.length) {
    items.push({
      id: 'segment',
      status: 'pass',
      data: { tags: tagFilter.join(', '), filteredOut },
    })
  }

  // ── Infrastructure ───────────────────────────────────────────────────
  const dkimOk = Boolean(config.dkimDomain && config.dkimSelector && config.dkimPrivateKey)
  items.push({ id: 'dkim', status: dkimOk ? 'pass' : 'warn' })

  // DNS authentication of the sender domain (SPF/DMARC, plus DKIM record when
  // a selector is configured). Missing records → mail lands in spam.
  const senderDomain = senderDomainFromEmail(config.smtpFromEmail || config.smtpUser)
  if (senderDomain) {
    try {
      const auth = await checkDnsAuth(senderDomain, dkimOk ? String(config.dkimSelector) : undefined)
      items.push({
        id: 'dns_spf',
        status: auth.spf.found ? 'pass' : 'warn',
        data: { domain: senderDomain },
      })
      items.push({
        id: 'dns_dmarc',
        status: auth.dmarc.found ? 'pass' : 'warn',
        data: { domain: senderDomain, policy: auth.dmarc.policy },
      })
      if (auth.dkim) {
        items.push({
          id: 'dns_dkim',
          status: auth.dkim.found ? 'pass' : 'warn',
          data: { domain: senderDomain, selector: auth.dkim.selector },
        })
      }
    } catch {
      // DNS resolution unavailable (offline dev) — don't block the checklist
    }
  }

  const baseUrl = String(config.trackingBaseUrl || '')
  const baseUrlOk = /^https:\/\//i.test(baseUrl) && !/localhost|127\.0\.0\.1/i.test(baseUrl)
  items.push({ id: 'tracking_url', status: baseUrlOk ? 'pass' : 'warn', data: { baseUrl } })

  // Same source of truth as the bounce processor: auto-detect defaults to ON,
  // so IMAP is effectively configured whenever SMTP host+credentials exist
  const imapCfg = getImapConfig()
  items.push({
    id: 'bounce_processing',
    status: imapCfg ? 'pass' : 'warn',
    data: imapCfg ? { host: imapCfg.host } : undefined,
  })

  const blocked = items.some(i => i.status === 'fail')
  const warnings = items.filter(i => i.status === 'warn').length

  return { items, blocked, warnings, active }
})
