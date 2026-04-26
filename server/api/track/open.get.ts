import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  // campaignId comes ONLY from the DB — never trust the query param

  setHeader(event, 'Content-Type', 'image/gif')
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')

  if (sendId) {
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

        if (send.status !== 'opened') {
          await db.update(sends).set({ status: 'opened' }).where(eq(sends.id, sendId))
          // Only count first open — subsequent loads (preview panes, bot rechecks) are skipped
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
