import { requireApiKey, idempotent } from '~/server/utils/api-keys'
import { subscribeContact } from '~/server/utils/subscribe'
import { getClientIp } from '~/server/utils/auth'

/**
 * POST /api/v1/contacts — create or update (subscribe) a contact.
 * Body: { email, name?, company?, role?, phone?, tags?, listIds?, custom?, doubleOptIn?, consentText? }
 * Same consent rules as forms: bounced/complained are refused, former
 * unsubscribers only come back through a confirmation email.
 */
export default defineEventHandler(async (event) => {
  const key = requireApiKey(event, 'contacts:write')
  const body = await readBody<Record<string, any>>(event)
  return idempotent(event, key.id, () => {
    const r = subscribeContact({
      raw: body ?? {},
      tags: body?.tags,
      listIds: body?.listIds,
      custom: body?.custom,
      source: `api:${key.name}`.slice(0, 100),
      ip: getClientIp(event),
      consentText: typeof body?.consentText === 'string' ? body.consentText : null,
      doubleOptIn: typeof body?.doubleOptIn === 'boolean' ? body.doubleOptIn : undefined,
    })
    if (r.status === 'rejected') {
      throw createError({ statusCode: r.reason === 'invalid_email' ? 400 : 409, statusMessage: r.reason })
    }
    return r
  })
})
