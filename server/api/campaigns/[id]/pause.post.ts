import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { signalPause } from '~/server/utils/campaign-state'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const [campaign] = await db.select({ status: campaigns.status })
    .from(campaigns).where(eq(campaigns.id, campaignId))

  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status !== 'sending') {
    throw createError({ statusCode: 409, statusMessage: 'Campaign is not currently sending' })
  }

  await db.update(campaigns)
    .set({ status: 'paused' })
    .where(eq(campaigns.id, campaignId))

  // Signal in-memory so the send loop stops immediately without polling the DB
  signalPause(campaignId)

  return { paused: true }
})
