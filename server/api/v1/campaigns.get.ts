import { sqlite } from '~/server/db/index'
import { requireApiKey } from '~/server/utils/api-keys'

// GET /api/v1/campaigns — recent campaigns with their metrics (for BI tools).
export default defineEventHandler((event) => {
  requireApiKey(event, 'campaigns:read')
  const limit = Math.min(200, Math.max(1, Number(getQuery(event).limit) || 50))
  const rows = sqlite.prepare(
    `SELECT id, name, subject, status, datetime(started_at, 'unixepoch') AS startedAt, datetime(finished_at, 'unixepoch') AS finishedAt,
            total_recipients AS recipients, sent_count AS delivered, confirmed_open_count AS opens, open_count AS rawOpens,
            click_count AS clicks, bounce_count AS bounces, complaint_count AS complaints, unsubscribe_count AS unsubscribes
     FROM campaigns WHERE kind = 'regular' ORDER BY id DESC LIMIT ?`,
  ).all(limit)
  return { data: rows }
})
