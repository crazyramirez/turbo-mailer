import { verifyApiKey, getClientIp } from '~/server/utils/auth'
import { subscribeContact } from '~/server/utils/subscribe'

// Server-to-server subscription (API key). Double opt-in per global setting.
// Bounced/complained addresses are refused; previously unsubscribed ones only
// come back through a confirmation email.
export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  const incoming = event.headers.get('x-api-key') || event.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''

  if (!config.apiSecret || !incoming || !verifyApiKey(incoming, String(config.apiSecret))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  if (!body?.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })

  const result = subscribeContact({
    raw: body,
    tags: body.tags,
    listIds: body.listIds,
    custom: body.custom,
    source: 'api',
    ip: getClientIp(event),
    userAgent: getHeader(event, 'user-agent') ?? null,
    consentText: typeof body.consentText === 'string' ? body.consentText : null,
  })

  if (result.status === 'rejected') {
    if (result.reason === 'invalid_email') throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })
    throw createError({ statusCode: 409, statusMessage: 'Address is suppressed (bounced or complained) and cannot be subscribed' })
  }

  return {
    ok: true,
    contactId: result.contactId,
    status: result.status,
    pendingConfirmation: result.status === 'pending_confirmation',
  }
})
