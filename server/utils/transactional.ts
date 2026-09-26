import { sqlite } from '~/server/db/index'
import { startCampaign } from '~/server/utils/send-engine'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { readTemplateFile } from '~/server/utils/template-files'
import { getSmtpProfiles } from '~/server/utils/mailer'

// Transactional sends through the public API: one hidden carrier campaign per
// sender profile holds them (for tracking, logs and the breaker); each send
// carries its own subject/HTML/variables in send_payloads.

function carrierFor(profileId: string | null): number {
  const row = sqlite.prepare(`SELECT id FROM campaigns WHERE kind = 'transactional' AND COALESCE(sender_profile_id, '') = ?`).get(profileId ?? '') as { id: number } | undefined
  if (row) return row.id
  return Number(sqlite.prepare(
    `INSERT INTO campaigns (name, subject, status, kind, sender_profile_id, created_at, total_recipients, sent_count, open_count, click_count, fail_count)
     VALUES (?, 'transactional', 'sent', 'transactional', ?, ?, 0, 0, 0, 0, 0)`,
  ).run(`API transaccional${profileId ? ` · ${profileId}` : ''}`, profileId, Math.floor(Date.now() / 1000)).lastInsertRowid)
}

export interface TransactionalInput {
  to: string
  subject?: string
  html?: string
  template?: string
  variables?: Record<string, unknown>
  from?: string | null
}

export function queueTransactional(input: TransactionalInput, apiKeyId: number, idempotencyKey?: string | null): { id: number; status: string } {
  const profileId = input.from || null
  if (profileId && !getSmtpProfiles(useServerConfig()).some(p => p.id === profileId)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown sender profile "${profileId}"` })
  }
  let html = input.html
  if (!html && input.template) {
    html = readTemplateFile(input.template) ?? undefined
    if (!html) throw createError({ statusCode: 404, statusMessage: `Template "${input.template}" not found` })
  }
  if (!html) throw createError({ statusCode: 400, statusMessage: 'html or template is required' })
  if (html.length > 500_000) throw createError({ statusCode: 413, statusMessage: 'HTML too large (500KB max)' })
  const subject = String(input.subject || '').trim()
  if (!subject) throw createError({ statusCode: 400, statusMessage: 'subject is required' })

  const vars = input.variables && typeof input.variables === 'object' ? input.variables : {}
  if (JSON.stringify(vars).length > 50_000) throw createError({ statusCode: 413, statusMessage: 'variables too large' })

  const campaignId = carrierFor(profileId)
  const contact = sqlite.prepare('SELECT id FROM contacts WHERE email = ? COLLATE NOCASE').get(input.to) as { id: number } | undefined
  const now = Math.floor(Date.now() / 1000)
  let sendId = 0
  sqlite.transaction(() => {
    sendId = Number(sqlite.prepare(`INSERT INTO sends (campaign_id, contact_id, email, status, attempts, opened_by_proxy) VALUES (?, ?, ?, 'pending', 0, 0)`)
      .run(campaignId, contact?.id ?? null, input.to).lastInsertRowid)
    sqlite.prepare('INSERT INTO send_payloads (send_id, subject, html, vars, api_key_id, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sendId, subject.slice(0, 500), sanitizeEmailHtml(html!), JSON.stringify(vars), apiKeyId, idempotencyKey ?? null)
    sqlite.prepare(`UPDATE campaigns SET status = 'sending', finished_at = NULL, started_at = COALESCE(started_at, ?), total_recipients = COALESCE(total_recipients, 0) + 1 WHERE id = ?`)
      .run(now, campaignId)
  })()
  startCampaign(campaignId)
  return { id: sendId, status: 'queued' }
}

export function sendStatus(sendId: number) {
  const s = sqlite.prepare(
    `SELECT s.id, s.email, s.status, s.error_msg AS error, s.bounce_class AS bounceClass, s.message_id AS messageId,
            s.sent_at AS sentAt, c.kind
     FROM sends s JOIN campaigns c ON c.id = s.campaign_id WHERE s.id = ?`,
  ).get(sendId) as any
  if (!s) return null
  const events = sqlite.prepare(`SELECT event_type AS type, url, datetime(created_at, 'unixepoch') AS at FROM tracking_events WHERE send_id = ? ORDER BY id`).all(sendId)
  return { ...s, sentAt: s.sentAt ? new Date(s.sentAt * 1000).toISOString() : null, events }
}
