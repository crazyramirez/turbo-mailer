import { db } from '~/server/db/index'
import { campaigns, sends, trackingEvents } from '~/server/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      sentCount: campaigns.sentCount,
      openCount: campaigns.openCount,
      clickCount: campaigns.clickCount,
      failCount: campaigns.failCount,
      totalRecipients: campaigns.totalRecipients,
      startedAt: campaigns.startedAt,
      finishedAt: campaigns.finishedAt,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  // Delivery breakdown
  const deliveryBreakdown = await db
    .select({
      status: sends.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(sends)
    .where(eq(sends.campaignId, campaignId))
    .groupBy(sends.status)

  // Link-level click breakdown
  const linkStats = await db
    .select({
      url: trackingEvents.url,
      clicks: sql<number>`COUNT(*)`,
      uniqueClickers: sql<number>`COUNT(DISTINCT contact_id)`,
    })
    .from(trackingEvents)
    .where(and(
      eq(trackingEvents.campaignId, campaignId),
      eq(trackingEvents.eventType, 'click')
    ))
    .groupBy(trackingEvents.url)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(20)

  // Opens distribution by hour (0–72h after send)
  const openDistribution = await db
    .select({
      hourBucket: sql<number>`MIN(CAST((te.created_at - s.sent_at) / 3600 AS INTEGER), 72)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(trackingEvents).as('te')
    .innerJoin(sends.as('s'), eq(sends.id, trackingEvents.sendId))
    .where(and(
      eq(trackingEvents.campaignId, campaignId),
      eq(trackingEvents.eventType, 'open'),
      sql`s.sent_at IS NOT NULL`,
      sql`te.created_at >= s.sent_at`
    ))
    .groupBy(sql`MIN(CAST((te.created_at - s.sent_at) / 3600 AS INTEGER), 72)`)
    .orderBy(sql`1`)

  return {
    campaign,
    deliveryBreakdown,
    linkStats,
    openDistribution,
  }
})
