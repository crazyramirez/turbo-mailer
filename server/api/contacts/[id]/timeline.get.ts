import { db } from '~/server/db/index'
import { contacts, sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, desc } from 'drizzle-orm'

// Contact activity timeline: campaign sends + open/click events, newest first.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, id))
  if (!contact) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  const sendRows = await db
    .select({
      sendId: sends.id,
      status: sends.status,
      sentAt: sends.sentAt,
      errorMsg: sends.errorMsg,
      campaignId: sends.campaignId,
      campaignName: campaigns.name,
      subject: sends.personalizedSubject,
    })
    .from(sends)
    .innerJoin(campaigns, eq(campaigns.id, sends.campaignId))
    .where(eq(sends.contactId, id))
    .orderBy(desc(sends.id))
    .limit(100)

  const eventRows = await db
    .select({
      eventType: trackingEvents.eventType,
      url: trackingEvents.url,
      createdAt: trackingEvents.createdAt,
      campaignId: trackingEvents.campaignId,
      campaignName: campaigns.name,
    })
    .from(trackingEvents)
    .innerJoin(campaigns, eq(campaigns.id, trackingEvents.campaignId))
    .where(eq(trackingEvents.contactId, id))
    .orderBy(desc(trackingEvents.createdAt))
    .limit(200)

  type TimelineEntry = {
    type: 'sent' | 'failed' | 'bounced' | 'open' | 'click'
    at: Date | null
    campaignId: number | null
    campaignName: string
    detail?: string | null
  }

  const entries: TimelineEntry[] = []

  for (const s of sendRows) {
    if (s.status === 'pending') continue
    entries.push({
      type: s.status === 'failed' ? 'failed' : s.status === 'bounced' ? 'bounced' : 'sent',
      at: s.sentAt,
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      detail: s.errorMsg || s.subject,
    })
  }
  for (const e of eventRows) {
    entries.push({
      type: e.eventType,
      at: e.createdAt,
      campaignId: e.campaignId,
      campaignName: e.campaignName,
      detail: e.url,
    })
  }

  entries.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))

  return {
    entries: entries.slice(0, 200),
    stats: {
      sent: sendRows.filter(s => ['sent', 'opened'].includes(s.status)).length,
      opens: eventRows.filter(e => e.eventType === 'open').length,
      clicks: eventRows.filter(e => e.eventType === 'click').length,
      bounced: sendRows.filter(s => s.status === 'bounced').length,
    },
  }
})
