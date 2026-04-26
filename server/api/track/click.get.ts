import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  const targetUrl = query.u ? decodeURIComponent(String(query.u)) : null

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

  if (sendId) {
    try {
      const ip = getHeader(event, 'x-forwarded-for') || getHeader(event, 'x-real-ip') || 'unknown'
      const userAgent = getHeader(event, 'user-agent') || ''

      console.log('[track/click] sendId:', sendId, 'url:', targetUrl)
      const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
      console.log('[track/click] send found:', !!send)
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
