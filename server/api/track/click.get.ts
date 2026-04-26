import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { verifyClickToken } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  const targetUrl = query.u ? decodeURIComponent(String(query.u)) : null
  const sig = String(query.sig ?? '')

  if (!targetUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing target URL' })
  }

  try {
    const parsed = new URL(targetUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol')
    }
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid redirect URL' })
  }

  const config = useRuntimeConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }
  if (!verifyClickToken(sendId, targetUrl, sig, config.unsubscribeSecret as string)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid or missing link signature' })
  }

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
