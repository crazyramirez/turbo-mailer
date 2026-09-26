import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import { appendFileSync, statSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { sqlite } from '~/server/db/index'
import { useServerConfig } from './serverConfig'
import { dataDir } from './data-dir'
import { parseVerpAddress, verifySendTag } from '~/server/utils/mailer'
import { classifySmtpError } from '~/server/utils/smtp-classify'
import { suppress } from '~/server/utils/suppression'
import { emitWebhook } from '~/server/utils/webhook'
import { loadSendContext, performUnsubscribe } from '~/server/utils/subscription'
import { pauseCampaign } from '~/server/utils/campaign-state'
import { sendAlert } from '~/server/utils/alerts'
import {
  extractDsn, extractOriginalRefs, extractFeedbackReport, looksLikeBounce,
  dmarcXmlFromAttachment, parseDmarcXml,
} from '~/server/utils/inbound-parse'

// Reads the bounce mailbox over IMAP and turns machine mail into facts:
//
//   DSN / NDR        → hard bounce (suppress contact) / soft / policy block
//   ARF complaint    → unsubscribe + suppress as 'complained' (+ breaker)
//   mailto unsubscribe (List-Unsubscribe mailto:) → unsubscribe
//   DMARC aggregate  → stored for the deliverability dashboard
//
// Attribution is exact whenever possible: VERP return path → signed X-TM-ID
// header → our Message-ID. The old matcher flagged EVERY past send to the
// address as bounced, rewriting the history of campaigns that had delivered
// fine months before.

function blog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  console.log(msg)
  try {
    const p = resolve(dataDir, 'bounce.log')
    try {
      if (statSync(p).size > 1_000_000) renameSync(p, `${p}.1`)
    } catch {}
    appendFileSync(p, line, 'utf-8')
  } catch {}
}

export interface ImapConfig {
  host: string
  port: number
  user: string
  pass: string
  tls: boolean
}

export function autoDetectImapHost(smtpHost: string): string {
  const h = smtpHost.toLowerCase().trim()
  if (h.includes('gmail') || h.includes('googlemail')) return 'imap.gmail.com'
  if (h.includes('outlook') || h.includes('office365')) return 'outlook.office365.com'
  if (h.includes('hotmail') || h.includes('live.com')) return 'imap-mail.outlook.com'
  if (h.includes('yahoo')) return 'imap.mail.yahoo.com'
  if (h.includes('zoho')) return 'imap.zoho.com'
  if (h.includes('icloud') || h.includes('me.com')) return 'imap.mail.me.com'
  if (h.startsWith('smtp.')) return h.replace('smtp.', 'imap.')
  if (h.startsWith('mail.')) return h
  return h
}

export function getImapConfig(): ImapConfig | null {
  const cfg = useServerConfig()
  const smtpUser = String(cfg.smtpUser || '')
  const smtpPass = String(cfg.smtpPass || '')
  if (!smtpUser || !smtpPass) return null

  const autoDetect = cfg.imapAutoDetect !== false && String(cfg.imapAutoDetect) !== 'false'

  if (autoDetect) {
    const smtpHost = String(cfg.smtpHost || '')
    if (!smtpHost) return null
    return { host: autoDetectImapHost(smtpHost), port: 993, user: smtpUser, pass: smtpPass, tls: true }
  }

  const host = String(cfg.imapHost || '')
  if (!host) return null
  return {
    host,
    port: Number(cfg.imapPort || 993),
    user: String(cfg.imapUser || smtpUser),
    pass: String(cfg.imapPass || smtpPass),
    tls: cfg.imapTls !== false && String(cfg.imapTls) !== 'false',
  }
}

// ── State ─────────────────────────────────────────────────────────────────

function getSetting(key: string): string | null {
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string) {
  sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, value, Math.floor(Date.now() / 1000))
}

// ── Attribution ────────────────────────────────────────────────────────────

interface SendRow { id: number; campaignId: number; contactId: number | null; email: string; status: string; sentAt: number | null }

const SEND_COLS = 'id, campaign_id AS campaignId, contact_id AS contactId, email, status, sent_at AS sentAt'

function sendById(id: number): SendRow | undefined {
  return sqlite.prepare(`SELECT ${SEND_COLS} FROM sends WHERE id = ?`).get(id) as SendRow | undefined
}

function envelopeRecipients(parsed: ParsedMail): string[] {
  const out: string[] = []
  for (const h of ['delivered-to', 'x-original-to', 'envelope-to', 'x-envelope-to', 'to']) {
    const v = parsed.headers.get(h) as any
    if (!v) continue
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) out.push(...v.map(String))
    else if (v?.text) out.push(String(v.text))
    else if (v?.value) out.push(...(v.value as any[]).map((x: any) => String(x.address ?? '')))
  }
  return out
}

function attribute(parsed: ParsedMail, secret: string, recipient: string | null, date: Date): { send: SendRow; method: string } | null {
  for (const addr of envelopeRecipients(parsed)) {
    const verp = parseVerpAddress(addr, secret)
    if (verp?.kind === 'b') {
      const s = sendById(verp.sendId)
      if (s) return { send: s, method: 'verp' }
    }
  }
  const refs = extractOriginalRefs(parsed)
  if (refs.tmId) {
    const id = verifySendTag(refs.tmId, secret)
    const s = id ? sendById(id) : undefined
    if (s) return { send: s, method: 'x-tm-id' }
  }
  if (refs.messageId) {
    const s = sqlite.prepare(`SELECT ${SEND_COLS} FROM sends WHERE message_id = ?`).get(refs.messageId) as SendRow | undefined
    if (s) return { send: s, method: 'message-id' }
  }
  // Last resort: the most recent send to that address shortly before the report
  const email = recipient ?? refs.to
  if (email) {
    const before = Math.floor(date.getTime() / 1000) + 120
    const after = before - 7 * 86_400
    const s = sqlite.prepare(
      `SELECT ${SEND_COLS} FROM sends WHERE email = ? COLLATE NOCASE AND status IN ('sent', 'opened') AND sent_at BETWEEN ? AND ?
       ORDER BY sent_at DESC LIMIT 1`,
    ).get(email, after, before) as SendRow | undefined
    if (s) return { send: s, method: 'address+time' }
  }
  return null
}

function recountCampaign(campaignId: number) {
  sqlite.prepare(
    `UPDATE campaigns SET
       sent_count = (SELECT COUNT(*) FROM sends WHERE campaign_id = ? AND status IN ('sent', 'opened')),
       fail_count = (SELECT COUNT(*) FROM sends WHERE campaign_id = ? AND status IN ('failed', 'bounced'))
     WHERE id = ?`,
  ).run(campaignId, campaignId, campaignId)
}

// ── Handlers ────────────────────────────────────────────────────────────────

interface RunStats { checked: number; bounced: number; softOrBlocked: number; complaints: number; unsubscribes: number; dmarc: number; unattributed: number }

function handleBounce(parsed: ParsedMail, secret: string, date: Date, stats: RunStats, touched: Set<number>) {
  const recipients = extractDsn(parsed).filter(r => r.action === 'failed' || (!r.action && r.status?.startsWith('5')))
  if (!recipients.length) return
  for (const r of recipients) {
    const hit = attribute(parsed, secret, r.recipient, date)
    if (!hit) {
      stats.unattributed++
      blog(`[bounce] unattributed ${r.recipient} ${r.status ?? ''}`)
      continue
    }
    const { send } = hit
    if (send.status !== 'sent' && send.status !== 'opened') continue // already failed/bounced/skipped
    const diagnostic = r.diagnostic ?? `Status ${r.status ?? '5.0.0'}`
    const code = Number(diagnostic.match(/\b([245]\d\d)\b/)?.[1]) || (r.status?.startsWith('5') ? 550 : 450)
    const f = classifySmtpError({ responseCode: code, response: `${code} ${r.status ?? ''} ${diagnostic}`, command: 'RCPT TO' })
    const now = Math.floor(Date.now() / 1000)
    const detail = `NDR (${hit.method}) ${r.status ?? ''}: ${diagnostic}`.slice(0, 300)

    if (f.kind === 'hard') {
      sqlite.transaction(() => {
        sqlite.prepare(`UPDATE sends SET status = 'bounced', bounce_class = 'hard', error_msg = ? WHERE id = ?`).run(detail, send.id)
        if (send.contactId) sqlite.prepare(`UPDATE contacts SET status = 'bounced', updated_at = ? WHERE id = ?`).run(now, send.contactId)
        const already = sqlite.prepare(`SELECT 1 FROM tracking_events WHERE send_id = ? AND event_type = 'bounce'`).get(send.id)
        if (!already) {
          sqlite.prepare(`INSERT INTO tracking_events (send_id, campaign_id, contact_id, event_type, url, created_at) VALUES (?, ?, ?, 'bounce', ?, ?)`)
            .run(send.id, send.campaignId, send.contactId, 'async', now)
          sqlite.prepare('UPDATE campaigns SET bounce_count = COALESCE(bounce_count, 0) + 1 WHERE id = ?').run(send.campaignId)
        }
      })()
      suppress(send.email, 'bounced', detail, `ndr:campaign:${send.campaignId}`)
      emitWebhook('email.bounced', { sendId: send.id, campaignId: send.campaignId, contactId: send.contactId, email: send.email, type: 'hard', detail })
      stats.bounced++
    } else {
      // Asynchronous soft/policy failures: the email did not arrive, but the
      // address itself is fine — never mark the contact bounced
      sqlite.prepare(`UPDATE sends SET status = 'failed', bounce_class = ?, error_msg = ? WHERE id = ?`)
        .run(f.kind === 'block' ? 'block' : 'soft', detail, send.id)
      stats.softOrBlocked++
    }
    touched.add(send.campaignId)
    blog(`[bounce] ${send.email} → ${f.kind} via ${hit.method} (send ${send.id})`)
  }
}

function checkComplaintBreaker(campaignId: number) {
  const c = sqlite.prepare('SELECT name, status, sent_count AS sent, complaint_count AS complaints FROM campaigns WHERE id = ?')
    .get(campaignId) as { name: string; status: string; sent: number; complaints: number } | undefined
  if (!c) return
  const rate = c.sent > 0 ? c.complaints / c.sent : 0
  // Gmail/Yahoo consider > 0.3% spam-complaint rate unacceptable
  if (c.complaints >= 3 && rate > 0.003) {
    if (c.status === 'sending') pauseCampaign(campaignId, 'complaint_rate')
    sendAlert('critical', `Tasa de quejas alta: ${c.name}`, `${c.complaints} quejas de spam (${(rate * 100).toFixed(2)}%). Gmail y Yahoo penalizan por encima del 0,3%.${c.status === 'sending' ? ' La campaña se ha pausado.' : ''}`, `complaints:${campaignId}`)
  }
}

function handleComplaint(parsed: ParsedMail, secret: string, date: Date, stats: RunStats): boolean {
  const report = extractFeedbackReport(parsed)
  if (!report) return false
  const hit = attribute(parsed, secret, report.originalRecipient, date)
  if (!hit) {
    stats.unattributed++
    blog('[complaint] unattributed feedback report')
    return true
  }
  const ctx = loadSendContext(hit.send.id)
  if (ctx) {
    performUnsubscribe(ctx, { source: 'complaint', userAgent: report.userAgent })
    suppress(ctx.email, 'complained', `ARF ${report.feedbackType}`, `fbl:campaign:${ctx.campaignId}`)
    checkComplaintBreaker(ctx.campaignId)
    stats.complaints++
    blog(`[complaint] ${ctx.email} (${report.feedbackType}) via ${hit.method}`)
  }
  return true
}

function handleMailtoUnsubscribe(parsed: ParsedMail, secret: string, stats: RunStats): boolean {
  for (const addr of envelopeRecipients(parsed)) {
    const verp = parseVerpAddress(addr, secret)
    if (verp?.kind !== 'u') continue
    const ctx = loadSendContext(verp.sendId)
    if (!ctx) return true
    // Only honour it from the address the email was sent to
    const from = (parsed.from?.value?.[0]?.address ?? '').toLowerCase()
    if (from && from !== ctx.email.toLowerCase()) {
      blog(`[unsubscribe] mailto from ${from} ignored (send to ${ctx.email})`)
      return true
    }
    performUnsubscribe(ctx, { source: 'mailto' })
    stats.unsubscribes++
    blog(`[unsubscribe] mailto ${ctx.email}`)
    return true
  }
  return false
}

function handleDmarc(parsed: ParsedMail, stats: RunStats): boolean {
  const subject = (parsed.subject ?? '').toLowerCase()
  if (!/report domain|dmarc|aggregate report/.test(subject) && !(parsed.attachments ?? []).some(a => /\.(xml|zip|gz)$/i.test(a.filename ?? ''))) {
    return false
  }
  let handled = false
  for (const a of parsed.attachments ?? []) {
    const xml = dmarcXmlFromAttachment(a)
    if (!xml) continue
    const r = parseDmarcXml(xml)
    if (!r) continue
    handled = true
    const key = `${r.orgName ?? '?'}|${r.reportId ?? a.checksum ?? Math.random()}`
    sqlite.prepare(
      `INSERT OR IGNORE INTO dmarc_reports (report_key, org_name, domain, policy, date_begin, date_end, total, dmarc_pass, spf_aligned, dkim_aligned, sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(key, r.orgName, r.domain, r.policy, r.dateBegin, r.dateEnd, r.total, r.dmarcPass, r.spfAligned, r.dkimAligned,
      JSON.stringify(r.sources.slice(0, 200)), Math.floor(Date.now() / 1000))
    stats.dmarc++
    const failRate = r.total ? 1 - r.dmarcPass / r.total : 0
    if (r.total >= 20 && failRate > 0.05) {
      sendAlert('warning', `DMARC: ${Math.round(failRate * 100)}% de fallos (${r.orgName})`,
        `${r.total - r.dmarcPass} de ${r.total} mensajes de ${r.domain} no pasaron DMARC. Revisa SPF/DKIM o quién envía en tu nombre.`, `dmarc:${r.domain}`)
    }
  }
  return handled
}

// ── IMAP run ────────────────────────────────────────────────────────────────

let running: Promise<{ checked: number; bounced: number; errors: string[] } & Partial<RunStats>> | null = null

export function processBounces(cfg: ImapConfig) {
  if (running) return running
  running = runMailbox(cfg).finally(() => { running = null })
  return running
}

const CANDIDATE_SUBJECT = /undeliver|delivery|failure|returned|bounce|non-?delivery|abuse|complaint|report domain|dmarc|unsubscribe|feedback/i

async function runMailbox(cfg: ImapConfig) {
  const config = useServerConfig()
  const secret = String(config.unsubscribeSecret || '')
  const stats: RunStats = { checked: 0, bounced: 0, softOrBlocked: 0, complaints: 0, unsubscribes: 0, dmarc: 0, unattributed: 0 }
  const errors: string[] = []
  const touched = new Set<number>()

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: { rejectUnauthorized: String(config.imapAllowInvalidCert) !== 'true' ? true : false },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  } as any)

  try {
    blog(`[inbound] connecting ${cfg.user}@${cfg.host}:${cfg.port}`)
    await client.connect()
    const mailbox = await client.mailboxOpen('INBOX')
    const uidValidity = String(mailbox.uidValidity)
    const storedValidity = getSetting('imap:uidvalidity')
    let lastUid = storedValidity === uidValidity ? Number(getSetting('imap:lastuid') || 0) : 0

    let uids: number[]
    if (!lastUid) {
      const since = new Date(Date.now() - 14 * 86_400_000)
      const found = await client.search({ since }, { uid: true })
      uids = Array.isArray(found) ? found : []
    } else {
      const found = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })
      uids = (Array.isArray(found) ? found : []).filter(u => u > lastUid)
    }
    blog(`[inbound] ${uids.length} new message(s) since uid ${lastUid}`)

    // Cheap pass over envelopes, then full source only for machine mail
    const candidates: number[] = []
    if (uids.length) {
      for await (const msg of client.fetch(uids, { envelope: true, headers: ['content-type', 'delivered-to', 'x-original-to', 'to'] }, { uid: true })) {
        const subject = msg.envelope?.subject ?? ''
        const from = (msg.envelope?.from?.[0]?.address ?? '').toLowerCase()
        const headers = msg.headers ? msg.headers.toString('utf-8').toLowerCase() : ''
        if (
          /mailer-daemon|postmaster|dmarc|noreply-dmarc|abuse|feedback|complaints|fbl/.test(from)
          || CANDIDATE_SUBJECT.test(subject)
          || /report-type=/.test(headers)
          || /\+[bu]\d+\.[a-f0-9]{10}@/.test(headers)
        ) {
          candidates.push(msg.uid)
        }
        if (msg.uid > lastUid) lastUid = msg.uid
      }
    }

    for (const uid of candidates) {
      try {
        const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true })
        if (!msg || !msg.source) continue
        stats.checked++
        const parsed = await simpleParser(msg.source)
        const date = (msg.internalDate as Date) || parsed.date || new Date()
        if (handleMailtoUnsubscribe(parsed, secret, stats)) continue
        if (handleComplaint(parsed, secret, date, stats)) continue
        if (looksLikeBounce(parsed)) { handleBounce(parsed, secret, date, stats, touched); continue }
        handleDmarc(parsed, stats)
      } catch (e: any) {
        errors.push(`UID ${uid}: ${e.message}`)
      }
    }

    setSetting('imap:uidvalidity', uidValidity)
    setSetting('imap:lastuid', String(lastUid))
    await client.logout()
  } catch (e: any) {
    blog(`[inbound] FATAL: ${e.message}`)
    errors.push(e.message)
    try { await client.logout() } catch {}
  }

  for (const cid of touched) recountCampaign(cid)
  blog(`[inbound] done: checked=${stats.checked} bounced=${stats.bounced} soft/block=${stats.softOrBlocked} complaints=${stats.complaints} unsub=${stats.unsubscribes} dmarc=${stats.dmarc} unattributed=${stats.unattributed}`)
  return { ...stats, errors }
}
