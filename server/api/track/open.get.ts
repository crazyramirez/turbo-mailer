import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { and, eq, ne, sql, gt } from 'drizzle-orm'
import { verifyOpenToken } from '~/server/utils/auth'
import { emitWebhook } from '~/server/utils/webhook'

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

  const config = useServerConfig()
  if (sendId && sig) {
    if (!verifyOpenToken(sendId, sig, config.unsubscribeSecret as string)) {
      return PIXEL_GIF
    }

    try {
      const ua = getHeader(event, 'user-agent') || ''
      // Only block known non-email bots, allowing email proxies to track opens
      const isBot = /bot|crawler|spider|slurp|pingdom|lighthouse/i.test(ua)
      
      if (isBot) {
        return PIXEL_GIF
      }

      const ip = String(getHeader(event, 'x-forwarded-for') || getHeader(event, 'x-real-ip') || 'unknown').split(',')[0].trim()
      
      // 1. Memory debounce
      const lockKey = `${sendId}:${ip}`
      if (openLock.has(lockKey)) {
        return PIXEL_GIF
      }
      openLock.add(lockKey)
      setTimeout(() => openLock.delete(lockKey), 2000)

      // Synchronous transaction (better-sqlite3): dedup check, event insert
      // and counter increment are atomic — no await boundaries where a
      // concurrent open could double-count
      const recorded = db.transaction((tx) => {
        // 2. DB Deduplication
        const tenSecondsAgo = new Date(Date.now() - 10000)
        const existing = tx.select({ id: trackingEvents.id })
          .from(trackingEvents)
          .where(and(
            eq(trackingEvents.sendId, sendId),
            eq(trackingEvents.eventType, 'open'),
            eq(trackingEvents.ip, ip),
            gt(trackingEvents.createdAt, tenSecondsAgo)
          ))
          .limit(1)
          .get()
        if (existing) return null

        const send = tx.select().from(sends).where(eq(sends.id, sendId)).get()
        if (!send || !send.sentAt) return null

        const diffSeconds = (Date.now() - new Date(send.sentAt).getTime()) / 1000

        // Minimal threshold of 1s to filter only near-instant automated server scans
        if (diffSeconds < 1) return null

        const campaignId = send.campaignId

        tx.insert(trackingEvents).values({
          sendId,
          campaignId,
          contactId: send.contactId,
          eventType: 'open',
          ip,
          userAgent: ua,
          createdAt: new Date(),
        }).run()

        const marked = tx.update(sends)
          .set({ status: 'opened' })
          .where(and(eq(sends.id, sendId), eq(sends.status, 'sent')))
          .returning({ id: sends.id })
          .get()

        if (marked) {
          tx.update(campaigns)
            .set({ openCount: sql`${campaigns.openCount} + 1` })
            .where(eq(campaigns.id, campaignId))
            .run()
        }

        return { campaignId, contactId: send.contactId, email: send.email }
      })

      if (recorded) {
        emitWebhook('email.opened', { sendId, ...recorded })
      }
    } catch {
      // Silently fail for pixel
    }
  }

  return PIXEL_GIF
})


