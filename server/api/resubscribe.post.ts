import { verifyResubscribeToken, getClientIp } from '~/server/utils/auth'
import { checkAndIncrementSubLimit } from '~/server/utils/sub-rate-limit'
import { loadSendContext, performResubscribe, sendResubscribeConfirmation } from '~/server/utils/subscription'

// Re-subscription happens only on an explicit POST from the page button:
// link scanners that pre-open the "resubscribe" link in the unsubscribe
// confirmation email must never re-enable someone who opted out.
export default defineEventHandler(async (event) => {
  const config = useServerConfig()

  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, any>
  const sendId = Number(body?.s)
  const token = String(body?.t || '')

  if (!sendId || !token || !verifyResubscribeToken(sendId, token, String(config.unsubscribeSecret))) {
    return { status: 'error', message: 'Invalid link' }
  }

  try {
    const ctx = loadSendContext(sendId)
    if (!ctx?.contact) return { status: 'error', message: 'Contact not found' }

    if (ctx.contact.status === 'active') {
      return { status: 'already', customMessage: ctx.campaign?.resubEmailMessage || null }
    }

    // Anti flip-flop: re-subscribing is rate limited (unsubscribing never is)
    const limit = await checkAndIncrementSubLimit(ctx.contact.id)
    if (!limit.allowed) {
      const resetInHours = limit.resetAt ? Math.ceil((limit.resetAt.getTime() - Date.now()) / 3_600_000) : 1
      return { status: 'rate_limited', resetInHours }
    }

    const result = performResubscribe(ctx, { ip: getClientIp(event), userAgent: getHeader(event, 'user-agent') ?? null })
    if (!result.ok) {
      // A bounced or complaining address can't be re-enabled from a link
      return { status: 'error', message: result.reason === 'complained' ? 'Complaint on record' : 'Address not deliverable' }
    }

    sendResubscribeConfirmation(ctx, config).catch(err =>
      console.warn('[resubscribe] confirmation email failed:', err?.message))

    return { status: 'ok', customMessage: ctx.campaign?.resubEmailMessage || null }
  } catch {
    return { status: 'error', message: 'Server error' }
  }
})
