import { createHmac } from 'node:crypto'
import { assertPublicHttpUrl } from '~/server/utils/ssrf-guard'

// Outgoing webhooks: fire-and-forget POST to the configured URL on tracking
// events (open, click, unsubscribe, subscribe_confirmed). Configure via
// config.json { webhookUrl, webhookSecret } or WEBHOOK_URL / WEBHOOK_SECRET.
//
// Payload: { event, timestamp, data }
// Signature: X-TurboMailer-Signature: sha256=<HMAC-SHA256(rawBody, secret)>
// Consumers should verify the signature before trusting the payload.

export type WebhookEvent =
  | 'email.opened'
  | 'email.clicked'
  | 'contact.unsubscribed'
  | 'contact.subscribe_confirmed'

const TIMEOUT_MS = 5000

// Never let a slow/failing webhook consumer affect tracking endpoints:
// no retries, short timeout, errors only logged.
export function emitWebhook(eventName: WebhookEvent, data: Record<string, unknown>): void {
  const config = useServerConfig()
  const url = String(config.webhookUrl || '').trim()
  if (!url) return

  const body = JSON.stringify({
    event: eventName,
    timestamp: new Date().toISOString(),
    data,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'TurboMailer-Webhook/1.0',
  }
  const secret = String(config.webhookSecret || '')
  if (secret) {
    headers['X-TurboMailer-Signature'] =
      'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  }

  void (async () => {
    try {
      // Guard against a webhook URL pointing at internal services
      await assertPublicHttpUrl(url)
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        console.warn(`[webhook] ${eventName} → ${res.status} ${res.statusText}`)
      }
    } catch (err: any) {
      console.warn(`[webhook] ${eventName} failed: ${err?.message}`)
    }
  })()
}
