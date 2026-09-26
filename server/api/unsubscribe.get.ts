import { verifyUnsubscribeTokenForOptOut, signResubscribeToken } from '~/server/utils/auth'
import { loadSendContext } from '~/server/utils/subscription'

// READ-ONLY: tells the unsubscribe page who the link belongs to.
//
// It used to unsubscribe on GET, and the page called it on mount — so the
// security scanners that "click" every link in incoming mail (Microsoft Safe
// Links, Mimecast, Barracuda...) silently unsubscribed real subscribers. The
// opt-out now happens only on an explicit POST (button or RFC 8058).
export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const query = getQuery(event)
  const sendId = Number(query.s)
  const token = String(query.t || '')
  if (!sendId || !token || !verifyUnsubscribeTokenForOptOut(sendId, token, String(config.unsubscribeSecret))) {
    return { status: 'error', message: 'Invalid link' }
  }

  const ctx = loadSendContext(sendId)
  if (!ctx) return { status: 'error', message: 'Not found' }

  const [local, domain] = ctx.email.split('@')
  const maskedEmail = `${local?.[0] ?? ''}***@${domain ?? ''}`
  const already = ctx.contact?.status === 'unsubscribed'

  return {
    status: already ? 'already' : 'pending',
    maskedEmail,
    customMessage: already ? (ctx.campaign?.unsubEmailMessage || null) : null,
    resubToken: already ? signResubscribeToken(sendId, String(config.unsubscribeSecret)) : null,
  }
})
