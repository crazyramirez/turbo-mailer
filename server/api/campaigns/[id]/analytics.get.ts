import { db } from '~/server/db/index'
import { campaigns, sends, trackingEvents } from '~/server/db/schema'
import { eq, and, sql, isNotNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      sentCount: campaigns.sentCount,
      openCount: campaigns.openCount,
      confirmedOpenCount: campaigns.confirmedOpenCount,
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
      hourBucket: sql<number>`MIN(CAST((${trackingEvents.createdAt} - ${sends.sentAt}) / 3600 AS INTEGER), 72)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(trackingEvents)
    .innerJoin(sends, eq(sends.id, trackingEvents.sendId))
    .where(and(
      eq(trackingEvents.campaignId, campaignId),
      eq(trackingEvents.eventType, 'open'),
      // Relay prefetches all land in the first minutes after send and would
      // fabricate a spike at hour 0 that no human produced.
      sql`COALESCE(${trackingEvents.isProxy}, 0) = 0`,
      isNotNull(sends.sentAt),
      sql`${trackingEvents.createdAt} >= ${sends.sentAt}`
    ))
    .groupBy(sql`MIN(CAST((${trackingEvents.createdAt} - ${sends.sentAt}) / 3600 AS INTEGER), 72)`)
    .orderBy(sql`1`)

  // How much of this campaign's "opens" came from privacy relays rather than
  // people — the number that explains a suspiciously high open rate.
  const [openQuality] = await db
    .select({
      confirmed: sql<number>`COUNT(*) FILTER (WHERE ${sends.status} = 'opened' AND COALESCE(${sends.openedByProxy}, 0) = 0)`,
      proxyOnly: sql<number>`COUNT(*) FILTER (WHERE ${sends.status} = 'opened' AND ${sends.openedByProxy} = 1)`,
    })
    .from(sends)
    .where(eq(sends.campaignId, campaignId))

  return {
    campaign,
    deliveryBreakdown,
    linkStats,
    openDistribution,
    openQuality,
  }
})
