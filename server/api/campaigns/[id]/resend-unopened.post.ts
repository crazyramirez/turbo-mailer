import { db } from '~/server/db/index'
import { campaigns, sends } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Creates a follow-up draft campaign targeting contacts who received the
// original email but never opened it. The draft goes through the normal
// review → precheck → send flow; send.post.ts resolves its recipients from
// the source campaign's sends instead of the list.

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ subject?: string; name?: string }>(event).catch(() => ({} as any))

  const [source] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (source.status !== 'sent') {
    throw createError({ statusCode: 400, statusMessage: 'Only finished campaigns can be re-sent' })
  }
  if (source.resendOfId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot chain re-sends — use the original campaign' })
  }

  // Delivered but never opened. Clicks flip send status to 'opened' too,
  // so status='sent' is exactly the never-engaged set.
  const unopened = await db
    .select({ id: sends.id })
    .from(sends)
    .where(and(eq(sends.campaignId, campaignId), eq(sends.status, 'sent')))

  if (unopened.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No unopened recipients to re-send to' })
  }

  const subject = String(body?.subject || '').trim().slice(0, 255) || source.subject
  const name = String(body?.name || '').trim().slice(0, 255) || `${source.name} — follow-up`

  const [created] = await db.insert(campaigns).values({
    name,
    subject,
    templateName: source.templateName,
    templateHtml: source.templateHtml,
    listId: source.listId,
    tagFilter: Array.isArray(source.tagFilter) ? source.tagFilter : [],
    resendOfId: campaignId,
    status: 'draft',
    unsubEmailSubject: source.unsubEmailSubject,
    unsubEmailMessage: source.unsubEmailMessage,
    resubEmailSubject: source.resubEmailSubject,
    resubEmailMessage: source.resubEmailMessage,
  }).returning()

  logAudit('campaign.resend_unopened', {
    sourceCampaignId: campaignId,
    newCampaignId: created.id,
    unopenedCount: unopened.length,
  }, getClientIp(event))

  return { campaign: created, unopenedCount: unopened.length }
})
