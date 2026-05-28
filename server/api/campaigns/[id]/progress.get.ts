import { db } from '~/server/db/index'
import { campaigns, sends } from '~/server/db/schema'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const [c] = await db
    .select({
      name: campaigns.name,
      status: campaigns.status,
      total: campaigns.totalRecipients,
      startedAt: campaigns.startedAt,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  // Count live from sends table for real-time accuracy (not batched campaign counters)
  const [live] = await db
    .select({
      sent: sql<number>`COUNT(*) FILTER (WHERE ${sends.status} IN ('sent', 'opened'))`,
      fail: sql<number>`COUNT(*) FILTER (WHERE ${sends.status} IN ('failed', 'bounced'))`,
    })
    .from(sends)
    .where(eq(sends.campaignId, campaignId))

  const sent = live?.sent ?? 0
  const fail = live?.fail ?? 0

  let etaMs: number | null = null
  if (c.status === 'sending' && c.startedAt && c.total && c.total > 0) {
    const processed = sent + fail
    const elapsedMs = Date.now() - new Date(c.startedAt).getTime()
    if (processed > 0 && elapsedMs > 0) {
      const ratePerMs = processed / elapsedMs
      const remaining = c.total - processed
      etaMs = remaining > 0 ? Math.round(remaining / ratePerMs) : 0
    }
  }

  return { name: c.name, status: c.status, total: c.total ?? 0, sent, fail, etaMs }
})
