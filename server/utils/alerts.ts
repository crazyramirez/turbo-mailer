import { assertPublicHttpUrl } from '~/server/utils/ssrf-guard'
import { logAudit } from '~/server/utils/audit'
import { sendSystemEmail } from '~/server/utils/mailer'

// Operator alerts for things that need a human: the circuit breaker paused a
// campaign, SMTP is down, the domain got blocklisted, a backup failed...
// Delivered to whatever is configured (Slack webhook, Telegram bot, email),
// always recorded in the audit log. Never throws — alerting must not break
// the code path that raised the alert.

export type AlertLevel = 'info' | 'warning' | 'critical'

// Same alert at most once per window, so a flapping condition doesn't spam
const recent = new Map<string, number>()
const DEDUP_MS = 30 * 60_000

export function sendAlert(level: AlertLevel, title: string, detail: string, key?: string): void {
  const dedupKey = key ?? `${level}:${title}`
  const last = recent.get(dedupKey)
  if (last && Date.now() - last < DEDUP_MS) return
  recent.set(dedupKey, Date.now())

  logAudit(`alert.${level}`, { title, detail })
  const config = useServerConfig()
  const icon = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️'
  const text = `${icon} TurboMailer — ${title}\n${detail}`

  void (async () => {
    const slack = String(config.alertSlackWebhook || '').trim()
    if (slack) {
      try {
        await assertPublicHttpUrl(slack)
        await fetch(slack, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(5000),
        })
      } catch (err: any) {
        console.warn('[alerts] slack failed:', err?.message)
      }
    }

    const tgToken = String(config.alertTelegramToken || '').trim()
    const tgChat = String(config.alertTelegramChatId || '').trim()
    if (tgToken && tgChat) {
      try {
        await fetch(`https://api.telegram.org/bot${encodeURIComponent(tgToken)}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tgChat, text }),
          signal: AbortSignal.timeout(5000),
        })
      } catch (err: any) {
        console.warn('[alerts] telegram failed:', err?.message)
      }
    }

    const email = String(config.alertEmail || '').trim()
    // An SMTP outage can't be reported over SMTP — skip email for those
    if (email && !/smtp/i.test(dedupKey)) {
      try {
        const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        await sendSystemEmail(config, {
          to: email,
          subject: `[TurboMailer] ${title}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a"><p><b>${safe(title)}</b></p><p style="white-space:pre-wrap">${safe(detail)}</p></div>`,
          text,
        })
      } catch (err: any) {
        console.warn('[alerts] email failed:', err?.message)
      }
    }
  })()
}
