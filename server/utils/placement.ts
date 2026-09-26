import { ImapFlow } from 'imapflow'
import { randomBytes } from 'node:crypto'
import { sqlite } from '~/server/db/index'
import { compileCampaign, renderEmail } from '~/server/utils/email-render'
import { profilesForSend, getTransport, senderIdentity, formatAddress, newMessageId } from '~/server/utils/mailer'
import { classifySmtpError, describeFailure } from '~/server/utils/smtp-classify'

// Inbox placement test with the user's OWN seed mailboxes (a Gmail, an
// Outlook, a Yahoo account...). The campaign is sent to each seed exactly as
// real recipients get it, then every seed is read over IMAP to see where the
// message landed: inbox, promotions, spam — or nowhere.

export interface SeedMailbox {
  id: string
  email: string
  label?: string
  provider?: string
  imapHost: string
  imapPort?: number
  user?: string
  pass: string
  tls?: boolean
}

type Placement = 'inbox' | 'promotions' | 'spam' | 'missing' | 'error' | 'pending'
interface SeedResult { seed: string; provider: string; placement: Placement; folder?: string; detail?: string }

export function getSeeds(config: Record<string, any>): SeedMailbox[] {
  const list = Array.isArray(config.seedMailboxes) ? config.seedMailboxes : []
  return list.filter((s: any) => s && s.email && s.imapHost && s.pass)
}

function guessProvider(email: string, host: string): string {
  const s = `${email} ${host}`.toLowerCase()
  if (/gmail|google/.test(s)) return 'Gmail'
  if (/outlook|hotmail|live\.|office365|microsoft/.test(s)) return 'Outlook'
  if (/yahoo|aol/.test(s)) return 'Yahoo'
  if (/icloud|me\.com/.test(s)) return 'iCloud'
  if (/gmx/.test(s)) return 'GMX'
  return 'Otro'
}

const JUNK_NAME = /spam|junk|bulk|correo no deseado|no deseado|basura|indésirable|unerwünscht/i

async function locateInSeed(seed: SeedMailbox, token: string): Promise<{ placement: Placement; folder?: string; detail?: string }> {
  const client = new ImapFlow({
    host: seed.imapHost,
    port: Number(seed.imapPort || 993),
    secure: seed.tls !== false,
    auth: { user: seed.user || seed.email, pass: seed.pass },
    logger: false,
    connectionTimeout: 15000,
  } as any)
  try {
    await client.connect()
    const boxes = await client.list()
    const inbox = boxes.find(b => b.specialUse === '\\Inbox' || b.path.toUpperCase() === 'INBOX')?.path ?? 'INBOX'
    const junk = boxes.filter(b => b.specialUse === '\\Junk' || JUNK_NAME.test(b.name) || JUNK_NAME.test(b.path)).map(b => b.path)

    const search = async (path: string) => {
      const lock = await client.getMailboxLock(path)
      try {
        const uids = await client.search({ header: { 'x-tm-placement': token } }, { uid: true })
        if (!Array.isArray(uids) || !uids.length) return null
        // Gmail exposes its tabs as labels on the message
        let labels: string[] = []
        try {
          const msg = await client.fetchOne(String(uids[0]), { labels: true } as any, { uid: true })
          labels = [...((msg as any)?.labels ?? [])].map(String)
        } catch {}
        return { labels }
      } finally {
        lock.release()
      }
    }

    const inInbox = await search(inbox)
    if (inInbox) {
      const promo = inInbox.labels.some(l => /promo|CATEGORY_PROMOTIONS|smartlabel_promo/i.test(l))
      return { placement: promo ? 'promotions' : 'inbox', folder: promo ? 'Promociones' : inbox }
    }
    for (const j of junk) {
      if (await search(j)) return { placement: 'spam', folder: j }
    }
    return { placement: 'missing' }
  } catch (err: any) {
    return { placement: 'error', detail: String(err?.message || err).slice(0, 200) }
  } finally {
    try { await client.logout() } catch {}
  }
}

const POLL_INTERVAL_MS = 20_000
const MAX_WAIT_MS = 10 * 60_000

export async function startPlacementTest(campaignId: number): Promise<{ id: number; token: string }> {
  const config = useServerConfig()
  const seeds = getSeeds(config)
  if (!seeds.length) throw createError({ statusCode: 400, statusMessage: 'No hay buzones semilla configurados (Ajustes → Entregabilidad)' })

  const campaign = sqlite.prepare(
    `SELECT id, name, subject, subject_b AS subjectB, template_html AS templateHtml, preheader, sender_profile_id AS senderProfileId, utm_params AS utmParams
     FROM campaigns WHERE id = ?`,
  ).get(campaignId) as any
  if (!campaign?.templateHtml) throw createError({ statusCode: 400, statusMessage: 'La campaña no tiene plantilla' })

  const profiles = profilesForSend(config, campaign.senderProfileId)
  if (!profiles.length) throw createError({ statusCode: 500, statusMessage: 'SMTP no configurado' })
  const profile = profiles[0]
  const identity = senderIdentity(profile, config)
  const token = randomBytes(12).toString('hex')
  const baseUrl = String(config.trackingBaseUrl || '').replace(/\/$/, '')
  const compiled = compileCampaign(campaign)
  let utm = null
  try { utm = campaign.utmParams ? JSON.parse(campaign.utmParams) : null } catch {}

  const results: SeedResult[] = seeds.map(s => ({ seed: s.email, provider: s.provider || s.label || guessProvider(s.email, s.imapHost), placement: 'pending' }))
  const id = Number(sqlite.prepare(
    `INSERT INTO placement_tests (campaign_id, token, status, results, created_at) VALUES (?, ?, 'running', ?, ?)`,
  ).run(campaignId, token, JSON.stringify(results), Math.floor(Date.now() / 1000)).lastInsertRowid)

  // Send the real thing to every seed
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]
    const rendered = renderEmail({
      compiled, variant: null, vars: { email: seed.email, name: seed.label || '' }, sendId: 0, baseUrl,
      secret: String(config.unsubscribeSecret || 'x'), utm, companyAddress: String(config.companyAddress || ''), track: true,
    })
    try {
      await getTransport(profile, config).sendMail({
        from: formatAddress(identity.name, identity.email),
        to: seed.email,
        replyTo: identity.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        messageId: newMessageId(identity.domain),
        headers: {
          'X-TM-Placement': token,
          'List-Unsubscribe': `<${rendered.oneClickUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'Feedback-ID': `c${campaignId}:placement:0:turbomailer`,
        },
      })
    } catch (err) {
      results[i] = { ...results[i], placement: 'error', detail: describeFailure(classifySmtpError(err)) }
    }
  }
  save(id, results)

  // Poll seeds in the background until everything is located or time runs out
  const started = Date.now()
  const poll = async () => {
    for (let i = 0; i < seeds.length; i++) {
      if (results[i].placement !== 'pending' && results[i].placement !== 'missing') continue
      const found = await locateInSeed(seeds[i], token)
      if (found.placement === 'missing' && Date.now() - started < MAX_WAIT_MS) continue
      results[i] = { ...results[i], ...found }
    }
    save(id, results)
    const open = results.some(r => r.placement === 'pending' || r.placement === 'missing')
    if (open && Date.now() - started < MAX_WAIT_MS) {
      setTimeout(() => { poll().catch(() => {}) }, POLL_INTERVAL_MS)
    } else {
      for (const r of results) if (r.placement === 'pending') r.placement = 'missing'
      save(id, results, true)
    }
  }
  setTimeout(() => { poll().catch(err => { console.error('[placement]', err); save(id, results, true, true) }) }, POLL_INTERVAL_MS)

  return { id, token }
}

function save(id: number, results: SeedResult[], done = false, failed = false) {
  sqlite.prepare(`UPDATE placement_tests SET results = ?, status = ?, finished_at = ? WHERE id = ?`)
    .run(JSON.stringify(results), failed ? 'failed' : done ? 'done' : 'running', done ? Math.floor(Date.now() / 1000) : null, id)
}
