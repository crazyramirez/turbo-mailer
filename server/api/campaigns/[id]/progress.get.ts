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
      startedAt: campaigns.startedAt,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  // Calculate ETA based on current send rate
  let etaMs: number | null = null
  if (c.status === 'sending' && c.startedAt && c.total && c.total > 0) {
    const processed = (c.sent ?? 0) + (c.fail ?? 0)
    const elapsedMs = Date.now() - new Date(c.startedAt).getTime()
    if (processed > 0 && elapsedMs > 0) {
      const ratePerMs = processed / elapsedMs
      const remaining = c.total - processed
      etaMs = remaining > 0 ? Math.round(remaining / ratePerMs) : 0
    }
  }

  return { ...c, etaMs }
})
