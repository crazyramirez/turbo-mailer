import { sqlite } from '~/server/db/index'
import { verifyApiKey, getClientIp } from '~/server/utils/auth'
import { suppress, normalizeEmail } from '~/server/utils/suppression'
import { recordConsent } from '~/server/utils/consent'
import { emitWebhook } from '~/server/utils/webhook'

// Server-to-server opt-out (API key). Suppresses the address even when no
// contact exists yet, so a later import can't mail it.
export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  const incoming = event.headers.get('x-api-key') || event.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''

  if (!config.apiSecret || !incoming || !verifyApiKey(incoming, String(config.apiSecret))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const email = normalizeEmail(body?.email)
  if (!email || !email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'email is required' })
  }

  suppress(email, 'unsubscribed', 'via api', 'api')
  const contact = sqlite.prepare('SELECT id, status FROM contacts WHERE email = ? COLLATE NOCASE').get(email) as { id: number; status: string } | undefined
  if (contact && contact.status !== 'unsubscribed') {
    sqlite.prepare(`UPDATE contacts SET status = 'unsubscribed', updated_at = ? WHERE id = ?`).run(Math.floor(Date.now() / 1000), contact.id)
  }
  recordConsent({ contactId: contact?.id ?? null, email, action: 'unsubscribe', source: 'api', ip: getClientIp(event) })
  emitWebhook('contact.unsubscribed', { contactId: contact?.id ?? null, email, source: 'api' })

  return { ok: true, email, contactId: contact?.id ?? null, status: 'unsubscribed' }
})
