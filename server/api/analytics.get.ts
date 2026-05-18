import { db } from '~/server/db/index'
import { contacts, campaigns, trackingEvents, sends } from '~/server/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

// Parse "YYYY-MM-DD" string to UTC midnight ms — avoids local-timezone drift
function utcDayMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function todayUtcStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function fillDays(rows: { date: string; count: number }[], fromStr: string, toStr: string) {
  const map = new Map(rows.map(r => [r.date, Number(r.count)]))
  const result = []
  let ms = utcDayMs(fromStr)
  const endMs = utcDayMs(toStr)
  while (ms <= endMs) {
    const dateStr = new Date(ms).toISOString().slice(0, 10)
    // Label in UTC so it matches the key
    const label = new Date(ms).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', timeZone: 'UTC',
    })
    result.push({ date: dateStr, label, count: map.get(dateStr) ?? 0 })
    ms += 86400000
  }
  return result
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const toStr = query.to ? String(query.to) : todayUtcStr()
  const fromStr = query.from ? String(query.from) : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  // Unix timestamps: full UTC day range
  const fromTs = Math.floor(utcDayMs(fromStr) / 1000)
  const toTs = Math.floor((utcDayMs(toStr) + 86399999) / 1000)
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

  // Recent opens (last 10) — use sends table so demo/imported opens show even without pixel
  const recentOpens = await db
    .select({
      id: sends.id,
      createdAt: sends.sentAt,
      ip: sql<string | null>`(SELECT ip FROM tracking_events WHERE send_id = ${sends.id} AND event_type = 'open' ORDER BY created_at DESC LIMIT 1)`,
      userAgent: sql<string | null>`(SELECT user_agent FROM tracking_events WHERE send_id = ${sends.id} AND event_type = 'open' ORDER BY created_at DESC LIMIT 1)`,
      campaignId: sends.campaignId,
      campaignName: campaigns.name,
      contactEmail: sends.email,
      contactName: contacts.name,
      contactCompany: contacts.company,
    })
    .from(sends)
    .leftJoin(campaigns, eq(campaigns.id, sends.campaignId))
    .leftJoin(contacts, eq(contacts.id, sends.contactId))
    .where(eq(sends.status, 'opened'))
    .orderBy(desc(sends.sentAt))
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

  // Opens by day — use tracking_events so timestamps reflect when opens occurred, not when sent
  const rawOpensByDay = await db.select({
    date: sql<string>`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`,
    count: sql<number>`COUNT(*)`,
  })
    .from(trackingEvents)
    .where(sql`event_type = 'open' AND created_at >= ${fromTs} AND created_at <= ${toTs}`)
    .groupBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)
    .orderBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)

  const opensByDay = fillDays(rawOpensByDay, fromStr, toStr)

  // Clicks by day — tracking_events gives actual per-click timestamps
  const rawClicksByDay = await db.select({
    date: sql<string>`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`,
    count: sql<number>`COUNT(*)`,
  })
    .from(trackingEvents)
    .where(sql`event_type = 'click' AND created_at >= ${fromTs} AND created_at <= ${toTs}`)
    .groupBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)
    .orderBy(sql`strftime('%Y-%m-%d', datetime(created_at, 'unixepoch'))`)

  const clicksByDay = fillDays(rawClicksByDay, fromStr, toStr)

  // Device breakdown — SQL CASE avoids loading all UA strings into memory
  const deviceBreakdown = await db.select({
    label: sql<string>`CASE
      WHEN user_agent LIKE '%iPhone%' OR user_agent LIKE '%iPad%' THEN 'iOS'
      WHEN user_agent LIKE '%Android%' THEN 'Android'
      WHEN user_agent LIKE '%Windows%' THEN 'Windows'
      WHEN user_agent LIKE '%Mac%' THEN 'Mac'
      ELSE 'Web' END`,
    count: sql<number>`COUNT(*)`,
  })
    .from(trackingEvents)
    .where(eq(trackingEvents.eventType, 'open'))
    .groupBy(sql`1`)
    .orderBy(sql`COUNT(*) DESC`)

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
