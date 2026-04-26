import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { verifyClickToken } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  const rawU = String(query.u ?? '')
  // H3 already URL-decodes query params; avoid double-decode by not calling decodeURIComponent again
  const targetUrl = rawU || null
  const sig = String(query.sig ?? '')

  console.log('[track/click] incoming s=%s u=%s sig=%s...', query.s, rawU?.slice(0, 80), sig?.slice(0, 16))

  if (!targetUrl) {
    console.log('[track/click] 400: missing u param')
    throw createError({ statusCode: 400, statusMessage: 'Missing target URL' })
  }

  try {
    const parsed = new URL(targetUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol')
    }
  } catch {
    console.log('[track/click] 400: invalid URL "%s"', targetUrl?.slice(0, 100))
    throw createError({ statusCode: 400, statusMessage: 'Invalid redirect URL' })
  }

  const config = useRuntimeConfig()
  if (!config.unsubscribeSecret) {
    console.log('[track/click] 500: UNSUBSCRIBE_SECRET not configured')
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }
  if (!verifyClickToken(sendId, targetUrl, sig, config.unsubscribeSecret as string)) {
    console.log('[track/click] 403: HMAC failed for sendId=%s url=%s', sendId, targetUrl?.slice(0, 80))
    throw createError({ statusCode: 403, statusMessage: 'Invalid or missing link signature' })
  }
  console.log('[track/click] HMAC OK sendId=%s → %s', sendId, targetUrl?.slice(0, 80))

  if (sendId) {
    try {
      const ip = getHeader(event, 'x-forwarded-for') || getHeader(event, 'x-real-ip') || 'unknown'
      const userAgent = getHeader(event, 'user-agent') || ''

      const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
      if (send) {
        await db.insert(trackingEvents).values({
          sendId,
          campaignId: send.campaignId,
          contactId: send.contactId,
          eventType: 'click',
          url: targetUrl,
          ip: String(ip).split(',')[0].trim(),
          userAgent,
          createdAt: new Date(),
        })

        await db.update(campaigns)
          .set({ clickCount: sql`${campaigns.clickCount} + 1` })
          .where(eq(campaigns.id, send.campaignId))
      }
    } catch (err) {
      console.error('[track/click] DB error:', err)
    }
  }

  await sendRedirect(event, targetUrl, 302)
})
