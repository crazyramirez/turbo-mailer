import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { and, eq, ne, sql, gt } from 'drizzle-orm'
import { verifyOpenToken } from '~/server/utils/auth'

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

// In-memory lock to prevent race conditions from rapid-fire open triggers
const openLock = new Set<string>()

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  const sig = String(query.sig ?? '')

  setHeader(event, 'Content-Type', 'image/gif')
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')

  const config = useRuntimeConfig()
  if (sendId && sig) {
    if (!verifyOpenToken(sendId, sig, config.unsubscribeSecret as string)) {
      return PIXEL_GIF
    }

    try {
      const ip = String(getHeader(event, 'x-forwarded-for') || getHeader(event, 'x-real-ip') || 'unknown').split(',')[0].trim()
      
      // 1. Memory debounce
      const lockKey = `${sendId}:${ip}`
      if (openLock.has(lockKey)) {
        return PIXEL_GIF
      }
      openLock.add(lockKey)
      setTimeout(() => openLock.delete(lockKey), 2000)

      // 2. DB Deduplication
      const tenSecondsAgo = new Date(Date.now() - 10000)
      const [existing] = await db.select()
        .from(trackingEvents)
        .where(and(
          eq(trackingEvents.sendId, sendId),
          eq(trackingEvents.eventType, 'open'),
          eq(trackingEvents.ip, ip),
          gt(trackingEvents.createdAt, tenSecondsAgo)
        ))
        .limit(1)

      if (!existing) {
        const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
        if (send) {
          const campaignId = send.campaignId

          await db.insert(trackingEvents).values({
            sendId,
            campaignId,
            contactId: send.contactId,
            eventType: 'open',
            ip,
            userAgent: getHeader(event, 'user-agent') || '',
            createdAt: new Date(),
          })

          const [marked] = await db.update(sends)
            .set({ status: 'opened' })
            .where(and(eq(sends.id, sendId), ne(sends.status, 'opened')))
            .returning({ id: sends.id })

          if (marked) {
            await db.update(campaigns)
              .set({ openCount: sql`${campaigns.openCount} + 1` })
              .where(eq(campaigns.id, campaignId))
          }
        }
      }
    } catch {
      // Silently fail for pixel
    }
  }

  return PIXEL_GIF
})


