import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, sql, and, gt, ne } from 'drizzle-orm'
import { verifyClickToken } from '~/server/utils/auth'

// In-memory lock to prevent race conditions from rapid-fire mobile clicks
const clickLock = new Set<string>()

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  const rawU = String(query.u ?? '')
  // H3 already URL-decodes query params; avoid double-decode by not calling decodeURIComponent again
  const targetUrl = rawU || null
  const sig = String(query.sig ?? '')

  if (!targetUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing target URL' })
  }

  const config = useRuntimeConfig()
  if (!verifyClickToken(sendId, targetUrl, sig, config.unsubscribeSecret as string)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid link signature' })
  }

  if (sendId) {
    try {
      const ip = String(getHeader(event, 'x-forwarded-for') || getHeader(event, 'x-real-ip') || 'unknown').split(',')[0].trim()
      
      // 1. Memory debounce (handles race conditions better than DB check alone)
      const lockKey = `${sendId}:${targetUrl}:${ip}`
      if (clickLock.has(lockKey)) {
        console.log('[track/click] debounce memory-lock hit for %s', lockKey)
        return await sendRedirect(event, targetUrl, 302)
      }
      clickLock.add(lockKey)
      setTimeout(() => clickLock.delete(lockKey), 2000)

      // 2. DB Deduplication (backup)
      const fiveSecondsAgo = new Date(Date.now() - 5000)
      const [existing] = await db.select()
        .from(trackingEvents)
        .where(and(
          eq(trackingEvents.sendId, sendId),
          eq(trackingEvents.eventType, 'click'),
          eq(trackingEvents.url, targetUrl),
          eq(trackingEvents.ip, ip),
          gt(trackingEvents.createdAt, fiveSecondsAgo)
        ))
        .limit(1)

      if (!existing) {
        const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
        if (send) {
          await db.insert(trackingEvents).values({
            sendId,
            campaignId: send.campaignId,
            contactId: send.contactId,
            eventType: 'click',
            url: targetUrl,
            ip,
            userAgent: getHeader(event, 'user-agent') || '',
            createdAt: new Date(),
          })

          await db.update(campaigns)
            .set({ clickCount: sql`${campaigns.clickCount} + 1` })
            .where(eq(campaigns.id, send.campaignId))
          
          if (send.status !== 'opened') {
            const [marked] = await db.update(sends)
              .set({ status: 'opened' })
              .where(and(eq(sends.id, sendId), ne(sends.status, 'opened')))
              .returning({ id: sends.id })
            
            if (marked) {
              await db.update(campaigns)
                .set({ openCount: sql`${campaigns.openCount} + 1` })
                .where(eq(campaigns.id, send.campaignId))
            }
          }
        }
      }
    } catch (err) {
      console.error('[track/click] error:', err)
    }
  }

  await sendRedirect(event, targetUrl, 302)
})


