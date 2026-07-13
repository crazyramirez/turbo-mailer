import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'
import { createFollowUpCampaign, getUnopenedRecipients } from '~/server/utils/send-setup'

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

  const unopened = await getUnopenedRecipients(campaignId)
  if (unopened.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No unopened recipients to re-send to' })
  }

  const created = await createFollowUpCampaign(source, {
    subject: body?.subject,
    name: body?.name,
  })

  logAudit('campaign.resend_unopened', {
    sourceCampaignId: campaignId,
    newCampaignId: created.id,
    unopenedCount: unopened.length,
  }, getClientIp(event))

  return { campaign: created, unopenedCount: unopened.length }
})
