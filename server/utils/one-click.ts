import type { H3Event } from 'h3'
import { verifyUnsubscribeTokenForOptOut, signResubscribeToken, getClientIp } from '~/server/utils/auth'
import { loadSendContext, performUnsubscribe, sendUnsubscribeConfirmation } from '~/server/utils/subscription'

/**
 * POST unsubscribe handler shared by /api/unsubscribe/one-click and the
 * legacy /unsubscribe URL that older emails carry in List-Unsubscribe.
 *
 * - RFC 8058 (mail provider): query ?s=&t=, form body "List-Unsubscribe=One-Click".
 *   No confirmation email: the provider already told the user it's done.
 * - Unsubscribe page button: JSON body { s, t, source: 'page' }.
 */
export async function handleUnsubscribePost(event: H3Event) {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }
  const secret = String(config.unsubscribeSecret)

  const query = getQuery(event)
  let body: Record<string, any> = {}
  try {
    const raw = await readBody(event)
    body = raw && typeof raw === 'object' ? raw : {}
  } catch {
    body = {}
  }

  const sendId = Number(query.s ?? body.s)
  const token = String(query.t ?? body.t ?? '')
  const fromPage = body.source === 'page'

  if (!sendId || !token || !verifyUnsubscribeTokenForOptOut(sendId, token, secret)) {
    setResponseStatus(event, 400)
    return { status: 'error', message: 'Invalid link' }
  }

  const ctx = loadSendContext(sendId)
  if (!ctx) {
    setResponseStatus(event, 404)
    return { status: 'error', message: 'Not found' }
  }

  const wasUnsubscribed = ctx.contact?.status === 'unsubscribed'
  performUnsubscribe(ctx, {
    source: fromPage ? 'page' : 'one-click',
    ip: getClientIp(event),
    userAgent: getHeader(event, 'user-agent') ?? null,
  })

  if (fromPage && !wasUnsubscribed && ctx.contact) {
    sendUnsubscribeConfirmation(ctx, config).catch(err =>
      console.warn('[unsubscribe] confirmation email failed:', err?.message))
  }

  return {
    status: wasUnsubscribed ? 'already' : 'ok',
    resubToken: signResubscribeToken(sendId, secret),
    customMessage: ctx.campaign?.unsubEmailMessage || null,
  }
}
