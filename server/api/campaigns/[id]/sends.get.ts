import { sqlite } from '~/server/db/index'

// Paginated send log + aggregate stats. The campaign page used to download the
// whole list every second while sending — 50k rows per poll on a big list.
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const q = getQuery(event)
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100))
  const offset = Math.max(0, Number(q.offset) || 0)
  const status = typeof q.status === 'string' && q.status ? q.status : null
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase().slice(0, 100) : ''

  const where: string[] = ['s.campaign_id = ?']
  const params: unknown[] = [campaignId]
  if (status === 'failed') {
    where.push(`s.status IN ('failed', 'bounced')`)
  } else if (status) {
    where.push('s.status = ?')
    params.push(status)
  }
  if (search) {
    where.push(`(LOWER(s.email) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(c.name, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(c.company, '')) LIKE ? ESCAPE '\\')`)
    const like = `%${search.replace(/[%_]/g, m => `\\${m}`)}%`
    params.push(like, like, like)
  }
  const whereSql = where.join(' AND ')

  const rows = sqlite.prepare(
    `SELECT s.id, s.email, s.status, s.variant, s.sent_at AS sentAt, s.error_msg AS errorMsg, s.bounce_class AS bounceClass,
            s.opened_by_proxy AS openedByProxy, s.scheduled_for AS scheduledFor, s.attempts,
            c.name AS contactName, c.company AS contactCompany
     FROM sends s LEFT JOIN contacts c ON c.id = s.contact_id
     WHERE ${whereSql}
     ORDER BY s.id LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as any[]

  const total = (sqlite.prepare(
    `SELECT COUNT(*) AS n FROM sends s LEFT JOIN contacts c ON c.id = s.contact_id WHERE ${whereSql}`,
  ).get(...params) as { n: number }).n

  const byStatusRows = sqlite.prepare(
    'SELECT status, COUNT(*) AS n FROM sends WHERE campaign_id = ? GROUP BY status',
  ).all(campaignId) as { status: string; n: number }[]
  const byStatus: Record<string, number> = {}
  byStatusRows.forEach(r => { byStatus[r.status] = r.n })

  const byVariantRows = sqlite.prepare(
    `SELECT variant,
            COUNT(*) FILTER (WHERE status IN ('sent', 'opened')) AS sent,
            COUNT(*) FILTER (WHERE status = 'opened' AND COALESCE(opened_by_proxy, 0) = 0) AS opens,
            (SELECT COUNT(DISTINCT te.send_id) FROM tracking_events te JOIN sends s2 ON s2.id = te.send_id
              WHERE s2.campaign_id = ? AND s2.variant = sends.variant AND te.event_type = 'click') AS clicks
     FROM sends WHERE campaign_id = ? AND variant IS NOT NULL GROUP BY variant`,
  ).all(campaignId, campaignId) as { variant: 'A' | 'B'; sent: number; opens: number; clicks: number }[]
  const byVariant: Record<string, { sent: number; opens: number; clicks: number }> = {}
  byVariantRows.forEach(r => { byVariant[r.variant] = { sent: r.sent, opens: r.opens, clicks: r.clicks } })

  // Same definition the follow-up uses: delivered, never really opened, still active
  const unopened = (sqlite.prepare(
    `SELECT COUNT(*) AS n FROM sends s JOIN contacts c ON c.id = s.contact_id
     WHERE s.campaign_id = ? AND c.status = 'active'
       AND (s.status = 'sent' OR (s.status = 'opened' AND COALESCE(s.opened_by_proxy, 0) = 1))`,
  ).get(campaignId) as { n: number }).n

  return {
    rows: rows.map(r => ({ ...r, sentAt: r.sentAt ? new Date(r.sentAt * 1000).toISOString() : null, openedByProxy: !!r.openedByProxy })),
    total,
    limit,
    offset,
    stats: { byStatus, byVariant, unopened },
  }
})
