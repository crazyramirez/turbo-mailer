import { sqlite } from '~/server/db/index'

// Nightly engagement model (only human signals: clicks and confirmed opens —
// privacy-proxy prefetches are excluded everywhere).
//
//   engagementScore 0-100: recency (40) + frequency (40) − fatigue (20) + newcomer bonus
//   bestSendHour: UTC hour with most human engagement (≥ 2 events), for STO

export function engagementScoreFor(input: {
  lastEngagedAt: number | null // unix seconds
  opens90: number
  clicks90: number
  sentSinceEngaged: number
  createdAt: number | null
  now?: number
}): number {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const days = input.lastEngagedAt ? (now - input.lastEngagedAt) / 86400 : Infinity
  const recency = days <= 7 ? 40 : days <= 30 ? 30 : days <= 90 ? 15 : days <= 180 ? 5 : 0
  const frequency = Math.min(40, input.opens90 * 6 + input.clicks90 * 12)
  const fatigue = Math.min(20, input.sentSinceEngaged * 2)
  const isNew = input.createdAt ? (now - input.createdAt) / 86400 <= 30 : false
  const bonus = isNew && !input.lastEngagedAt ? 25 : 0
  return Math.max(0, Math.min(100, Math.round(recency + frequency - fatigue + bonus)))
}

export function recomputeEngagement(): { contacts: number; withBestHour: number } {
  const now = Math.floor(Date.now() / 1000)
  const since90 = now - 90 * 86400
  const since180 = now - 180 * 86400

  const counts = new Map<number, { opens: number; clicks: number }>()
  for (const r of sqlite.prepare(
    `SELECT contact_id AS id,
            COUNT(DISTINCT CASE WHEN event_type = 'open' AND COALESCE(is_proxy, 0) = 0 THEN send_id END) AS opens,
            COUNT(DISTINCT CASE WHEN event_type = 'click' THEN send_id END) AS clicks
     FROM tracking_events WHERE created_at >= ? AND contact_id IS NOT NULL GROUP BY contact_id`,
  ).all(since90) as { id: number; opens: number; clicks: number }[]) {
    counts.set(r.id, { opens: r.opens, clicks: r.clicks })
  }

  // Best hour: mode of human engagement hours in the last 180 days
  const hours = new Map<number, number[]>()
  for (const r of sqlite.prepare(
    `SELECT contact_id AS id, CAST(strftime('%H', created_at, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS n
     FROM tracking_events
     WHERE created_at >= ? AND contact_id IS NOT NULL
       AND (event_type = 'click' OR (event_type = 'open' AND COALESCE(is_proxy, 0) = 0))
     GROUP BY contact_id, h`,
  ).all(since180) as { id: number; h: number; n: number }[]) {
    const arr = hours.get(r.id) ?? new Array(24).fill(0)
    arr[r.h] += r.n
    hours.set(r.id, arr)
  }

  const contacts = sqlite.prepare(
    `SELECT id, last_engaged_at AS lastEngagedAt, sent_since_engaged AS sentSinceEngaged, created_at AS createdAt FROM contacts`,
  ).all() as { id: number; lastEngagedAt: number | null; sentSinceEngaged: number | null; createdAt: number | null }[]

  const upd = sqlite.prepare('UPDATE contacts SET engagement_score = ?, best_send_hour = ? WHERE id = ?')
  let withBestHour = 0
  sqlite.transaction(() => {
    for (const c of contacts) {
      const k = counts.get(c.id) ?? { opens: 0, clicks: 0 }
      const score = engagementScoreFor({
        lastEngagedAt: c.lastEngagedAt, opens90: k.opens, clicks90: k.clicks,
        sentSinceEngaged: c.sentSinceEngaged ?? 0, createdAt: c.createdAt, now,
      })
      let best: number | null = null
      const h = hours.get(c.id)
      if (h) {
        const total = h.reduce((a, b) => a + b, 0)
        if (total >= 2) {
          // Smooth with neighbours so 09:59 and 10:01 count together
          let bestVal = -1
          for (let i = 0; i < 24; i++) {
            const v = h[i] * 2 + h[(i + 23) % 24] + h[(i + 1) % 24]
            if (v > bestVal) { bestVal = v; best = i }
          }
        }
      }
      if (best !== null) withBestHour++
      upd.run(score, best, c.id)
    }
  })()
  return { contacts: contacts.length, withBestHour }
}
