import { verifyResubscribeToken } from '~/server/utils/auth'
import { loadSendContext } from '~/server/utils/subscription'

// READ-ONLY status for the resubscribe page; the action is POST /api/resubscribe.
export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }
  const query = getQuery(event)
  const sendId = Number(query.s)
  const token = String(query.t || '')
  if (!sendId || !token || !verifyResubscribeToken(sendId, token, String(config.unsubscribeSecret))) {
    return { status: 'error', message: 'Invalid link' }
  }
  const ctx = loadSendContext(sendId)
  if (!ctx?.contact) return { status: 'error', message: 'Contact not found' }
  const [local, domain] = ctx.email.split('@')
  return {
    status: ctx.contact.status === 'active' ? 'already' : 'pending',
    maskedEmail: `${local?.[0] ?? ''}***@${domain ?? ''}`,
  }
})
