import { db, sqlite } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { getImapConfig } from '~/server/utils/bounce-processor'
import { senderDomainFromEmail } from '~/server/utils/dns-check'
import { domainHealth } from '~/server/utils/dns-deep'
import { resolveRecipients, sunsetSettings, isSunset } from '~/server/utils/recipients'
import { analyzeContent } from '~/server/utils/content-score'
import { compileCampaign, renderEmail } from '~/server/utils/email-render'
import { profilesForSend, senderIdentity, formatAddress } from '~/server/utils/mailer'
import { buildRawMessage, runSpamCheck } from '~/server/utils/spam-check'
import { latestBlocklistStatus } from '~/server/utils/blocklists'
import { warmupCapForToday, sentToday } from '~/server/utils/send-limiter'
import { lintEmailHtml } from '~/server/utils/email-lint'
import { finalizeEmailHtml } from '~/server/utils/email-compile'
import { repairEmailHtml, type RepairChange } from '~/server/utils/email-repair'

// Pre-send health check. Every item: { id, group, status, data }.
//   fail  blocks the send (only for hard problems: no recipients, no
//         unsubscribe link, empty template, localhost links...)
//   warn  worth fixing, you can still send
//   info  context, never a problem
//   pass  fine
// Anything that couldn't be verified (DNS down, filter unreachable) is left
// out rather than reported as a problem — no false alarms.

export interface PrecheckItem {
  id: string
  group: 'content' | 'audience' | 'auth' | 'infra'
  status: 'pass' | 'warn' | 'fail' | 'info'
  data?: Record<string, any>
}

const GMAIL_CLIP_BYTES = 102 * 1024
const LINK_CHECK_MAX = 15
const LINK_CHECK_TIMEOUT_MS = 6000

async function checkLinksAlive(urls: string[]): Promise<{ url: string; status: number | string }[]> {
  const unique = [...new Set(urls)]
    .filter(u => /^https?:\/\//i.test(u) && !/\{\{/.test(u))
    .slice(0, LINK_CHECK_MAX)
  const results = await Promise.all(unique.map(async (url) => {
    const opts = (method: string) => ({
      method,
      redirect: 'follow' as const,
      signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TurboMailer-LinkCheck)' },
    })
    try {
      let res = await fetch(url, opts('HEAD'))
      // Many servers reject HEAD or bots (403/405/501) but serve browsers fine
      if ([403, 405, 501].includes(res.status)) res = await fetch(url, opts('GET'))
      return { url, status: res.status }
    } catch {
      return { url, status: 'unreachable' as const }
    }
  }))
  // 401/403/429 mean "exists but protected / rate limited" — not broken
  return results.filter(r => r.status === 'unreachable' || (typeof r.status === 'number' && r.status >= 400 && ![401, 403, 429].includes(r.status)))
}

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useServerConfig()
  const live = !!getQuery(event).live

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  const items: PrecheckItem[] = []
  const push = (group: PrecheckItem['group'], id: string, status: PrecheckItem['status'], data?: Record<string, any>) =>
    items.push({ id, group, status, data })

  const html = campaign.templateHtml || ''
  const subject = campaign.subject || ''

  // ── Content ──────────────────────────────────────────────────────────
  if (!subject.trim()) push('content', 'subject', 'fail')
  else if (subject.length > 78) push('content', 'subject_length', 'warn', { length: subject.length })
  else push('content', 'subject', 'pass')

  if (!campaign.preheader?.trim()) push('content', 'preheader', 'info')
  else push('content', 'preheader', 'pass', { length: campaign.preheader.length })

  let score: ReturnType<typeof analyzeContent> | null = null
  let repairable: RepairChange[] = []
  if (!html.trim()) {
    push('content', 'template', 'fail')
  } else {
    push('content', 'template', 'pass')

    const hasUnsub = /\{\{\s*UNSUBSCRIBE_URL\s*\}\}/i.test(html)
    push('content', 'unsubscribe', hasUnsub ? 'pass' : 'fail')

    if (!/\{\{\s*COMPANY_ADDRESS\s*\}\}/i.test(html) && !String(config.companyAddress || '').trim()) {
      push('content', 'company_address', 'warn')
    }

    score = analyzeContent({ subject, html, preheader: campaign.preheader })
    push('content', 'content_score', score.level === 'good' ? 'pass' : 'warn', {
      score: score.score,
      level: score.level,
      findings: score.findings.slice(0, 12),
    })

    const sizeBytes = Buffer.byteLength(html, 'utf-8')
    push('content', 'size', sizeBytes > GMAIL_CLIP_BYTES ? 'warn' : 'pass', { kb: Math.round(sizeBytes / 1024) })

    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1])
    const insecure = hrefs.filter(h => /^http:\/\//i.test(h))
    const localhost = hrefs.filter(h => /^https?:\/\/(localhost|127\.|192\.168\.|10\.|0\.0\.0\.0)/i.test(h))
    const emptyLinks = hrefs.filter(h => h === '#' || h.trim() === '')
    if (localhost.length) push('content', 'links', 'fail', { localhost: localhost.slice(0, 5).join(', ') })
    else if (emptyLinks.length) push('content', 'links_empty', 'warn', { count: emptyLinks.length })
    else if (insecure.length) push('content', 'links', 'warn', { insecure: insecure.slice(0, 5).join(', ') })
    else push('content', 'links', 'pass', { count: hrefs.length })

    if (live) {
      const external = hrefs.filter(h => /^https?:\/\//i.test(h))
      if (external.length) {
        const broken = await checkLinksAlive(external)
        push('content', 'links_live', broken.length ? 'warn' : 'pass', broken.length
          ? { broken: broken.map(b => `${b.url} (${b.status})`).slice(0, 5).join(', '), count: broken.length }
          : { count: Math.min(new Set(external).size, LINK_CHECK_MAX) })
      }
    }

    // Images the recipient won't be able to load
    const baseUrl = String(config.trackingBaseUrl || '')
    const baseIsLocal = /\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)
    const srcs = [...html.matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi)].map(m => m[1])
    const unreachableImgs = srcs.filter(s => baseIsLocal ? (/^\//.test(s) || /\/\/(localhost|127\.)/i.test(s)) : /^https?:\/\/(192\.168\.|10\.)/i.test(s))
    if (unreachableImgs.length) push('content', 'images_local', 'fail', { count: unreachableImgs.length })

    // Email-client compatibility lint (Outlook, Gmail...)
    // Lint what actually goes out: the compile step already fixes a lot
    const lint = lintEmailHtml(finalizeEmailHtml(html))
    const serious = lint.filter(l => l.severity === 'warn')
    push('content', 'compat', serious.length ? 'warn' : 'pass', { issues: lint.slice(0, 10), count: serious.length })

    // What the one-click repair (POST /repair) would fix — nothing is written here
    try {
      repairable = (await repairEmailHtml(html, { dryRun: true, localOrigin: baseUrl || null })).changes
    } catch {}
  }

  // ── Audience ─────────────────────────────────────────────────────────
  const { recipients, excluded } = await resolveRecipients(campaign, config)
  const active = recipients.length
  push('audience', 'recipients', active > 0 ? 'pass' : 'fail', { active })
  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0)
  if (excludedTotal) push('audience', 'excluded', 'info', excluded)
  if (Array.isArray(campaign.tagFilter) && campaign.tagFilter.length) {
    push('audience', 'segment', 'info', { tags: campaign.tagFilter.join(', '), filteredOut: excluded.notInTags })
  }

  if (active) {
    const invalid = recipients.filter(r => r.verification?.status === 'invalid').length
    const risky = recipients.filter(r => r.verification?.status === 'risky').length
    const unverified = recipients.filter(r => !r.verification).length
    if (invalid) push('audience', 'list_quality', 'warn', { invalid, risky })
    else if (risky > active * 0.05) push('audience', 'list_quality', 'warn', { invalid, risky })
    else if (unverified === active) push('audience', 'list_quality', 'info', { unverified })
    else push('audience', 'list_quality', 'pass', { risky })

    // Would-be sunset contacts (policy off): suggest cleaning
    const s = sunsetSettings(config)
    if (!s.enabled) {
      const stale = recipients.filter(r => isSunset(r, s)).length
      if (stale > active * 0.1 && stale >= 20) push('audience', 'stale_contacts', 'warn', { stale, days: s.days })
    }
  }

  // ── Authentication ───────────────────────────────────────────────────
  const profiles = profilesForSend(config, campaign.senderProfileId)
  const profile = profiles[0]
  const identity = profile ? senderIdentity(profile, config) : null
  const fromDomain = identity ? senderDomainFromEmail(identity.email) : null
  const dkimDomain = profile?.dkimDomain
  const dkimOk = Boolean(profile?.dkimDomain && profile?.dkimSelector && profile?.dkimPrivateKey)
  push('auth', 'dkim', dkimOk ? 'pass' : 'warn')

  if (fromDomain) {
    try {
      const h = await domainHealth(fromDomain, dkimOk ? { domain: dkimDomain, selector: profile!.dkimSelector } : undefined)
      if (!h.spf.unknown) {
        if (!h.spf.record) push('auth', 'dns_spf', 'warn', { domain: fromDomain })
        else if (h.spf.multipleRecords) push('auth', 'spf_multiple', 'fail', { domain: fromDomain })
        else if (h.spf.tooMany) push('auth', 'spf_lookups', 'fail', { domain: fromDomain, lookups: h.spf.lookups })
        else if (h.spf.allQualifier === '+') push('auth', 'spf_plus_all', 'warn', { domain: fromDomain })
        else push('auth', 'dns_spf', 'pass', { domain: fromDomain, lookups: h.spf.lookups })
      }
      if (!h.dmarc.unknown) {
        if (!h.dmarc.record) push('auth', 'dns_dmarc', 'warn', { domain: fromDomain })
        else if (h.dmarc.policy === 'none') push('auth', 'dmarc_none', 'info', { domain: fromDomain })
        else push('auth', 'dns_dmarc', 'pass', { domain: fromDomain, policy: h.dmarc.policy })
        if (h.dmarc.record && !h.dmarc.hasRua) push('auth', 'dmarc_rua', 'info', { domain: fromDomain })
      }
      if (h.dkim && !h.dkim.unknown) {
        if (!h.dkim.found) push('auth', 'dns_dkim', 'warn', { domain: dkimDomain || fromDomain, selector: h.dkim.selector })
        else if (h.dkim.bits && h.dkim.bits < 2048) push('auth', 'dkim_weak', 'warn', { bits: h.dkim.bits })
        else push('auth', 'dns_dkim', 'pass', { domain: dkimDomain || fromDomain, selector: h.dkim.selector })
      }
      if (dkimOk && !h.dkimAligned) push('auth', 'dkim_alignment', 'warn', { from: fromDomain, dkim: dkimDomain })
      if (!h.mx.unknown && !h.mx.found) push('auth', 'from_mx', 'warn', { domain: fromDomain })
      if (h.bimi) push('auth', 'bimi', 'pass')
    } catch {
      // DNS unavailable — leave the items out rather than guess
    }
  }

  // ── Real spam filter (optional) ──────────────────────────────────────
  if (live && html.trim() && String(config.spamCheckUrl || '').trim() && profile && identity) {
    try {
      const sample = recipients[0] ?? { email: 'preview@example.com' }
      const rendered = renderEmail({
        compiled: compileCampaign(campaign), variant: null, vars: sample as any, sendId: 0,
        baseUrl: String(config.trackingBaseUrl || ''), secret: String(config.unsubscribeSecret || 'x'),
        utm: campaign.utmParams, companyAddress: String(config.companyAddress || ''), track: true,
      })
      const raw = await buildRawMessage({
        from: formatAddress(identity.name, identity.email), to: sample.email, subject: rendered.subject,
        html: rendered.html, text: rendered.text,
        headers: { 'List-Unsubscribe': `<${rendered.oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      })
      const r = await runSpamCheck(String(config.spamCheckUrl), raw, { from: identity.email, rcpt: sample.email })
      const ratio = r.score / (r.threshold || 1)
      push('content', 'spam_engine', r.isSpam ? 'warn' : ratio > 0.5 ? 'warn' : 'pass', {
        engine: r.engine, score: r.score, threshold: r.threshold,
        symbols: r.symbols.filter(s => s.score > 0).slice(0, 10),
      })
    } catch (err: any) {
      push('infra', 'spam_engine_unreachable', 'info', { error: String(err?.message || err).slice(0, 120) })
    }
  }

  // ── Infrastructure ───────────────────────────────────────────────────
  const baseUrl = String(config.trackingBaseUrl || '')
  const baseUrlOk = /^https:\/\//i.test(baseUrl) && !/localhost|127\.0\.0\.1/i.test(baseUrl)
  push('infra', 'tracking_url', baseUrlOk ? 'pass' : 'warn', { baseUrl })

  const imapCfg = getImapConfig()
  push('infra', 'bounce_processing', imapCfg ? 'pass' : 'warn', imapCfg ? { host: imapCfg.host } : undefined)

  const bl = latestBlocklistStatus()
  if (bl.checkedAt) {
    const listed = bl.results.filter(r => r.result === 'listed')
    push('infra', 'blocklists', listed.length ? 'warn' : 'pass', listed.length
      ? { listed: listed.map(l => `${l.target} (${l.name})`).join(', '), count: listed.length }
      : { checked: bl.results.filter(r => r.result === 'clean').length })
  }

  if (profiles.length > 1) push('infra', 'smtp_failover', 'pass', { count: profiles.length - 1 })

  const cap = warmupCapForToday(config)
  if (cap > 0) {
    const left = Math.max(0, cap - sentToday())
    push('infra', 'warmup', active > left ? 'info' : 'pass', { cap, left, active })
  }

  const blocked = items.some(i => i.status === 'fail')
  const warnings = items.filter(i => i.status === 'warn').length
  // Estimated duration at the configured pace
  const pace = Math.max(Number(config.smtpSendDelayMs ?? 2000) || 0, Number(config.smtpMaxEmailsPerSecond) > 0 ? 1000 / Number(config.smtpMaxEmailsPerSecond) : 0)
  const concurrency = Math.max(1, Math.min(10, Number(config.smtpConcurrency) || 1))
  const etaMinutes = Math.ceil((active * Math.max(pace, 150)) / concurrency / 60_000)

  const editable = ['draft', 'scheduled', 'paused'].includes(campaign.status)
  return { items, blocked, warnings, active, score: score?.score ?? null, etaMinutes, excluded, repairable: editable ? repairable : [], editable }
})
