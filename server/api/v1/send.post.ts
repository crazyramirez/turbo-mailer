import { requireApiKey, idempotent } from '~/server/utils/api-keys'
import { queueTransactional } from '~/server/utils/transactional'
import { isValidEmail } from '~/server/utils/validate'

/**
 * POST /api/v1/send — transactional email.
 * Body: { to, subject, html | template, variables?, from? (sender profile id) }
 * Header Idempotency-Key recommended: retries never send twice.
 */
export default defineEventHandler(async (event) => {
  const key = requireApiKey(event, 'send')
  const body = await readBody<Record<string, any>>(event)
  const to = String(body?.to || '').trim().toLowerCase()
  if (!isValidEmail(to)) throw createError({ statusCode: 400, statusMessage: 'Invalid "to" address' })
  return idempotent(event, key.id, () => queueTransactional({
    to,
    subject: body?.subject,
    html: body?.html,
    template: body?.template,
    variables: body?.variables,
    from: body?.from ?? null,
  }, key.id, getHeader(event, 'idempotency-key') ?? null))
})
