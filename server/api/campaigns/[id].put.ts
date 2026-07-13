import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { sanitizeTagFilter } from '~/server/utils/segment'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { name, subject, templateName, listId, status, scheduledAt,
    unsubEmailSubject, unsubEmailMessage, resubEmailSubject, resubEmailMessage } = body
  const templateHtml = body.templateHtml ? sanitizeEmailHtml(String(body.templateHtml)) : body.templateHtml

  const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'paused'] as const
  type CampaignStatus = typeof CAMPAIGN_STATUSES[number]
  // Only allow editing to non-operational states — sending/sent are set by the send pipeline
  const safeStatus: CampaignStatus = CAMPAIGN_STATUSES.includes(status) ? status : 'draft'

  // A/B test config: subjectB empty/absent disables the test
  const subjectB = typeof body.subjectB === 'string' ? body.subjectB.trim().slice(0, 255) : ''
  const abSamplePct = Math.min(50, Math.max(5, Number(body.abSamplePct) || 20))
  const abWaitMinutes = Math.min(7 * 24 * 60, Math.max(10, Number(body.abWaitMinutes) || 240))

  const [row] = await db.update(campaigns).set({
    name: name?.trim(),
    subject: subject?.trim(),
    subjectB: subjectB || null,
    abSamplePct,
    abWaitMinutes,
    templateName: templateName || null,
    templateHtml: templateHtml || null,
    listId: listId ? Number(listId) : null,
    tagFilter: sanitizeTagFilter(body.tagFilter),
    status: safeStatus,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    unsubEmailSubject: unsubEmailSubject?.trim() || null,
    unsubEmailMessage: unsubEmailMessage?.trim() || null,
    resubEmailSubject: resubEmailSubject?.trim() || null,
    resubEmailMessage: resubEmailMessage?.trim() || null,
  }).where(eq(campaigns.id, id)).returning()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return row
})
