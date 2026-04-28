import { db } from '~/server/db/index'
import { contacts, campaigns, trackingEvents, sends } from '~/server/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

function categorizeUA(ua: string | null) {
  if (!ua) return 'Web'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac')) return 'Mac'
  return 'Web'
}

function fillDays(rows: { date: string; count: number }[], days: number) {
  const map = new Map(rows.map(r => [r.date, Number(r.count)]))
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const dateStr = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    result.push({ date: dateStr, label, count: map.get(dateStr) ?? 0 })
  }
  return result
}

export default defineEventHandler(async () => {
  const [{ totalContacts }] = await db.select({ totalContacts: sql<number>`COUNT(*)` }).from(contacts)

  const [{ totalCampaigns }] = await db.select({ totalCampaigns: sql<number>`COUNT(*)` })
    .from(campaigns).where(eq(campaigns.status, 'sent'))

  const sentCampaigns = await db.select({
    sentCount: campaigns.sentCount,
    openCount: campaigns.openCount,
    clickCount: campaigns.clickCount,
  }).from(campaigns).where(eq(campaigns.status, 'sent'))

  let totalSent = 0, totalOpened = 0, totalClicked = 0
  for (const c of sentCampaigns) {
    totalSent += c.sentCount ?? 0
    totalOpened += c.openCount ?? 0
    totalClicked += c.clickCount ?? 0
  }

  const avgOpenRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0
  const avgClickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0

  // Recent opens (last 10)
  const recentOpens = await db
    .select({
      id: trackingEvents.id,
      createdAt: trackingEvents.createdAt,
      ip: trackingEvents.ip,
      userAgent: trackingEvents.userAgent,
      campaignId: trackingEvents.campaignId,
      campaignName: campaigns.name,
      contactEmail: sends.email,
      contactName: contacts.name,
      contactCompany: contacts.company,
    })
    .from(trackingEvents)
    .leftJoin(campaigns, eq(campaigns.id, trackingEvents.campaignId))
    .leftJoin(sends, eq(sends.id, trackingEvents.sendId))
    .leftJoin(contacts, eq(contacts.id, trackingEvents.contactId))
    .where(eq(trackingEvents.eventType, 'open'))
    .orderBy(desc(trackingEvents.createdAt))
    .limit(10)

  // Top campaigns by open rate
  const topCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      sentCount: campaigns.sentCount,
      openCount: campaigns.openCount,
      clickCount: campaigns.clickCount,
      finishedAt: campaigns.finishedAt,
    })
    .from(campaigns)
    .where(eq(campaigns.status, 'sent'))
    .orderBy(desc(campaigns.openCount))
    .limit(5)

  // Opens by day — last 14 days
  const threshold14 = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000)
  const rawOpensByDay = await db.select({
    date: sql<string>`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`,
    count: sql<number>`COUNT(*)`,
  })
    .from(trackingEvents)
    .where(sql`event_type = 'open' AND created_at >= ${threshold14}`)
    .groupBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)
    .orderBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)

  const opensByDay = fillDays(rawOpensByDay, 14)

  // Clicks by day — last 14 days
  const rawClicksByDay = await db.select({
    date: sql<string>`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`,
    count: sql<number>`COUNT(*)`,
  })
    .from(trackingEvents)
    .where(sql`event_type = 'click' AND created_at >= ${threshold14}`)
    .groupBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)
    .orderBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)

  const clicksByDay = fillDays(rawClicksByDay, 14)

  // Device breakdown — all opens
  const uaRows = await db.select({ userAgent: trackingEvents.userAgent })
    .from(trackingEvents)
    .where(eq(trackingEvents.eventType, 'open'))

  const deviceMap: Record<string, number> = {}
  for (const { userAgent } of uaRows) {
    const key = categorizeUA(userAgent)
    deviceMap[key] = (deviceMap[key] ?? 0) + 1
  }
  const deviceBreakdown = Object.entries(deviceMap)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }))

  return {
    totalContacts,
    totalCampaigns,
    avgOpenRate,
    avgClickRate,
    totalSent,
    totalOpened,
    totalClicked,
    recentOpens,
    topCampaigns,
    opensByDay,
    clicksByDay,
    deviceBreakdown,
  }
})
