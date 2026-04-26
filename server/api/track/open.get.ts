import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { and, eq, ne, sql } from 'drizzle-orm'
import { verifyOpenToken } from '~/server/utils/auth'

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  const sig = String(query.sig ?? '')

  setHeader(event, 'Content-Type', 'image/gif')
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')

  const config = useRuntimeConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  if (sendId && sig) {
    if (!verifyOpenToken(sendId, sig, config.unsubscribeSecret as string)) {
      // Silently return pixel — don't reveal invalid sig to bots
      return PIXEL_GIF
    }

    try {
      const ip = getHeader(event, 'x-forwarded-for') || getHeader(event, 'x-real-ip') || 'unknown'
      const userAgent = getHeader(event, 'user-agent') || ''

      const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
      if (send) {
        const campaignId = send.campaignId

        await db.insert(trackingEvents).values({
          sendId,
          campaignId,
          contactId: send.contactId,
          eventType: 'open',
          ip: String(ip).split(',')[0].trim(),
          userAgent,
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
    } catch {
      // Never fail the pixel request
    }
  }

  return PIXEL_GIF
})
