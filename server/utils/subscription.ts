import { sqlite } from '~/server/db/index'
import { signResubscribeToken } from '~/server/utils/auth'
import { emailT } from '~/server/utils/email-locale'
import { escapeHtml } from '~/server/utils/template'
import { sendSystemEmail } from '~/server/utils/mailer'
import { suppress, unsuppressIfOptOut, getSuppression } from '~/server/utils/suppression'
import { emitWebhook } from '~/server/utils/webhook'
import { recordConsent } from '~/server/utils/consent'
import { configFlag } from '~/server/utils/serverConfig'

// Unsubscribe / resubscribe logic shared by every entry point:
// RFC 8058 one-click POST, the unsubscribe page, the preference center,
// mailto: unsubscribe requests and spam complaints.

export interface SendContext {
  sendId: number
  campaignId: number
  email: string
  contact: { id: number; email: string; name: string | null; status: string; locale: string | null } | null
  campaign: {
    id: number
    name: string
    unsubEmailSubject: string | null
    unsubEmailMessage: string | null
    resubEmailSubject: string | null
    resubEmailMessage: string | null
  } | null
}

export function loadSendContext(sendId: number): SendContext | null {
  const send = sqlite.prepare('SELECT id, campaign_id AS campaignId, contact_id AS contactId, email FROM sends WHERE id = ?')
    .get(sendId) as { id: number; campaignId: number; contactId: number | null; email: string } | undefined
  if (!send) return null
  const contactById = send.contactId
    ? sqlite.prepare('SELECT id, email, name, status, locale FROM contacts WHERE id = ?').get(send.contactId)
    : undefined
  // Contact may have been deleted and re-imported: fall back to the address
  const contact = (contactById ?? sqlite.prepare('SELECT id, email, name, status, locale FROM contacts WHERE email = ? COLLATE NOCASE').get(send.email)) as SendContext['contact'] | undefined
  const campaign = sqlite.prepare(
    `SELECT id, name, unsub_email_subject AS unsubEmailSubject, unsub_email_message AS unsubEmailMessage,
            resub_email_subject AS resubEmailSubject, resub_email_message AS resubEmailMessage
     FROM campaigns WHERE id = ?`,
  ).get(send.campaignId) as SendContext['campaign'] | undefined
  return { sendId: send.id, campaignId: send.campaignId, email: send.email, contact: contact ?? null, campaign: campaign ?? null }
}

export type UnsubscribeSource = 'one-click' | 'page' | 'preferences' | 'mailto' | 'complaint' | 'api' | 'manual'

/**
 * Unsubscribes the recipient of a send. Idempotent. Never rate limited: an
 * opt-out must always be honoured (CAN-SPAM / GDPR / Gmail & Yahoo rules).
 * Returns whether this call changed anything.
 */
export function performUnsubscribe(ctx: SendContext, opts: { source: UnsubscribeSource; ip?: string | null; userAgent?: string | null }): { changed: boolean } {
  const reason = opts.source === 'complaint' ? 'complained' : 'unsubscribed'
  // Suppress by address even when no contact row exists any more
  suppress(ctx.email, reason, `via ${opts.source}`, `campaign:${ctx.campaignId}`)

  let changed = false
  const now = Math.floor(Date.now() / 1000)
  sqlite.transaction(() => {
    if (ctx.contact && ctx.contact.status !== 'unsubscribed') {
      sqlite.prepare(`UPDATE contacts SET status = 'unsubscribed', updated_at = ? WHERE id = ?`).run(now, ctx.contact.id)
      changed = true
    }
    // One unsubscribe per send counts toward the campaign
    const already = sqlite.prepare(`SELECT 1 FROM tracking_events WHERE send_id = ? AND event_type IN ('unsubscribe', 'complaint') LIMIT 1`).get(ctx.sendId)
    if (!already) {
      sqlite.prepare(`INSERT INTO tracking_events (send_id, campaign_id, contact_id, event_type, url, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(ctx.sendId, ctx.campaignId, ctx.contact?.id ?? null, opts.source === 'complaint' ? 'complaint' : 'unsubscribe', opts.source, opts.ip ?? null, opts.userAgent ?? null, now)
      const column = opts.source === 'complaint' ? 'complaint_count' : 'unsubscribe_count'
      sqlite.prepare(`UPDATE campaigns SET ${column} = COALESCE(${column}, 0) + 1 WHERE id = ?`).run(ctx.campaignId)
      changed = true
    }
  })()

  if (changed) {
    recordConsent({
      contactId: ctx.contact?.id ?? null,
      email: ctx.email,
      action: opts.source === 'complaint' ? 'complaint' : 'unsubscribe',
      source: `${opts.source}:campaign:${ctx.campaignId}`,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    })
    emitWebhook(opts.source === 'complaint' ? 'email.complained' : 'contact.unsubscribed', {
      contactId: ctx.contact?.id ?? null,
      email: ctx.email,
      campaignId: ctx.campaignId,
      sendId: ctx.sendId,
      source: opts.source,
    })
  }
  return { changed }
}

/** Re-activates a contact that opted out. Refuses bounced/complained addresses. */
export function performResubscribe(ctx: SendContext, opts: { ip?: string | null; userAgent?: string | null }): { ok: boolean; reason?: 'bounced' | 'complained' | 'no_contact' } {
  if (!ctx.contact) return { ok: false, reason: 'no_contact' }
  const sup = getSuppression(ctx.email)
  if (sup?.reason === 'complained') return { ok: false, reason: 'complained' }
  if (sup?.reason === 'bounced' || ctx.contact.status === 'bounced') return { ok: false, reason: 'bounced' }
  unsuppressIfOptOut(ctx.email)
  sqlite.prepare(`UPDATE contacts SET status = 'active', updated_at = ? WHERE id = ?`).run(Math.floor(Date.now() / 1000), ctx.contact.id)
  recordConsent({
    contactId: ctx.contact.id,
    email: ctx.email,
    action: 'resubscribe',
    source: `resubscribe-link:campaign:${ctx.campaignId}`,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  })
  return { ok: true }
}

function paragraphs(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

function shell(icon: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:40px 48px;text-align:center;">
              <div style="font-size:40px;margin-bottom:16px;">${icon}</div>
              <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 12px;">${title}</h1>
              ${body}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Confirmation after a page/preference-center unsubscribe (never after one-click). */
export async function sendUnsubscribeConfirmation(ctx: SendContext, config: Record<string, any>): Promise<void> {
  if (!configFlag(config, 'unsubConfirmationEmail', true)) return
  const lang = ctx.contact?.locale?.startsWith('en') ? 'en' : 'es'
  const t = (key: string, vars?: Record<string, string>) => emailT(lang, `emails.${key}`, vars)
  const baseUrl = String(config.trackingBaseUrl || 'http://localhost:3000').replace(/\/$/, '')
  const resubUrl = `${baseUrl}/resubscribe?s=${ctx.sendId}&t=${signResubscribeToken(ctx.sendId, String(config.unsubscribeSecret))}`
  const displayName = escapeHtml(ctx.contact?.name || ctx.email)
  const message = ctx.campaign?.unsubEmailMessage ? paragraphs(ctx.campaign.unsubEmailMessage) : t('unsub_message')
  await sendSystemEmail(config, {
    to: ctx.email,
    subject: ctx.campaign?.unsubEmailSubject || t('unsub_subject'),
    html: shell('✓', t('unsub_title'), `
      <p style="font-size:15px;color:#64748b;line-height:1.7;margin:0 0 24px;">${t('unsub_greeting', { name: displayName })}<br>${message}</p>
      <p style="font-size:13px;color:#94a3b8;margin:0 0 20px;">${t('unsub_resub_text')}</p>
      <a href="${resubUrl}" style="display:inline-block;padding:12px 28px;background:#6366f1;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${t('unsub_resub_button')}</a>`),
    text: `${t('unsub_title')}\n\n${ctx.campaign?.unsubEmailMessage || t('unsub_message')}\n\n${t('unsub_resub_text')} ${resubUrl}`,
  })
}

export async function sendResubscribeConfirmation(ctx: SendContext, config: Record<string, any>): Promise<void> {
  const lang = ctx.contact?.locale?.startsWith('en') ? 'en' : 'es'
  const t = (key: string, vars?: Record<string, string>) => emailT(lang, `emails.${key}`, vars)
  const displayName = escapeHtml(ctx.contact?.name || ctx.email)
  const message = ctx.campaign?.resubEmailMessage ? paragraphs(ctx.campaign.resubEmailMessage) : t('resub_message')
  await sendSystemEmail(config, {
    to: ctx.email,
    subject: ctx.campaign?.resubEmailSubject || t('resub_subject'),
    html: shell('👋', t('resub_title'), `
      <p style="font-size:15px;color:#64748b;line-height:1.7;margin:0 0 24px;">${t('resub_greeting', { name: displayName })}<br>${message}</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">${t('resub_footer')}</p>`),
    text: `${t('resub_title')}\n\n${ctx.campaign?.resubEmailMessage || t('resub_message')}`,
  })
}
