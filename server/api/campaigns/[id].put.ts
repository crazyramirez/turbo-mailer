import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { name, subject, templateName, templateHtml, listId, status, scheduledAt } = body

  const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'paused'] as const
  type CampaignStatus = typeof CAMPAIGN_STATUSES[number]
  // Only allow editing to non-operational states — sending/sent are set by the send pipeline
  const safeStatus: CampaignStatus = CAMPAIGN_STATUSES.includes(status) ? status : 'draft'

  const [row] = await db.update(campaigns).set({
    name: name?.trim(),
    subject: subject?.trim(),
    templateName: templateName || null,
    templateHtml: templateHtml || null,
    listId: listId ? Number(listId) : null,
    status: safeStatus,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  }).where(eq(campaigns.id, id)).returning()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return row
})
