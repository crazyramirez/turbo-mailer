import { sqlite } from '~/server/db/index'
import { getRunInfo } from '~/server/utils/send-engine'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const c = sqlite.prepare(
    `SELECT name, status, total_recipients AS total, started_at AS startedAt, ab_phase AS abPhase, pause_reason AS pauseReason
     FROM campaigns WHERE id = ?`,
  ).get(campaignId) as { name: string; status: string; total: number | null; startedAt: number | null; abPhase: string | null; pauseReason: string | null } | undefined

  if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  // Live counts from the sends table (campaign counters can lag a flush)
  const live = sqlite.prepare(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('sent', 'opened')) AS sent,
       COUNT(*) FILTER (WHERE status IN ('failed', 'bounced')) AS fail,
       COUNT(*) FILTER (WHERE status = 'held') AS held,
       COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
       COUNT(*) FILTER (WHERE status IN ('pending', 'sending')) AS pending,
       COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_for > strftime('%s', 'now')) AS scheduled
     FROM sends WHERE campaign_id = ?`,
  ).get(campaignId) as { sent: number; fail: number; held: number; skipped: number; pending: number; scheduled: number }

  const engine = getRunInfo(campaignId)

  let etaMs: number | null = null
  if (c.status === 'sending' && c.startedAt && c.total && c.total > 0 && !engine.throttle) {
    const processed = live.sent + live.fail + live.skipped
    const elapsedMs = Date.now() - c.startedAt * 1000
    if (processed > 0 && elapsedMs > 0) {
      // A/B holdout and future (send-time optimized) sends aren't in flight
      const remaining = Math.max(0, live.pending - live.scheduled)
      etaMs = remaining > 0 ? Math.round(remaining / (processed / elapsedMs)) : 0
    }
  }

  return {
    name: c.name,
    status: c.status,
    total: c.total ?? 0,
    sent: live.sent,
    fail: live.fail,
    held: live.held,
    skipped: live.skipped,
    pending: live.pending,
    scheduled: live.scheduled,
    abPhase: c.abPhase,
    pauseReason: c.pauseReason,
    throttle: engine.throttle,
    etaMs,
  }
})
