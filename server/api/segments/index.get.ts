import { sqlite } from '~/server/db/index'
import { countSegmentRules } from '~/server/utils/segments'

export default defineEventHandler(async (event) => {
  const withCounts = getQuery(event).counts !== '0'
  const rows = sqlite.prepare('SELECT id, name, description, rules, cached_count AS cachedCount, cached_at AS cachedAt, updated_at AS updatedAt FROM segments ORDER BY name').all() as any[]
  const now = Math.floor(Date.now() / 1000)
  return rows.map((r) => {
    let rules: any = null
    try { rules = JSON.parse(r.rules) } catch {}
    let count = r.cachedCount
    // Refresh counts older than 10 minutes
    if (withCounts && rules && (!r.cachedAt || now - r.cachedAt > 600)) {
      try {
        count = countSegmentRules(rules)
        sqlite.prepare('UPDATE segments SET cached_count = ?, cached_at = ? WHERE id = ?').run(count, now, r.id)
      } catch {
        count = null
      }
    }
    return { id: r.id, name: r.name, description: r.description, rules, count }
  })
})
