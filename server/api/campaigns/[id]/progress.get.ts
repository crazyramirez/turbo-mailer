import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const [c] = await db
    .select({
      name: campaigns.name,
      status: campaigns.status,
      sent: campaigns.sentCount,
      total: campaigns.totalRecipients,
      fail: campaigns.failCount,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return c
})
