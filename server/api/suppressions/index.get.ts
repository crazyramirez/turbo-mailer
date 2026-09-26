import { sqlite } from '~/server/db/index'
import { emailHash } from '~/server/utils/suppression'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 50))
  const offset = Math.max(0, Number(q.offset) || 0)
  const reason = typeof q.reason === 'string' && q.reason ? q.reason : null
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase() : ''

  const where: string[] = []
  const params: unknown[] = []
  if (reason) { where.push('reason = ?'); params.push(reason) }
  if (search) {
    // Full address → exact hash match; partial → hint (masked) match
    if (search.includes('@') && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(search)) {
      where.push('email_hash = ?'); params.push(emailHash(search))
    } else {
      where.push('email_hint LIKE ?'); params.push(`%${search.replace(/[%_]/g, '')}%`)
    }
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = sqlite.prepare(
    `SELECT id, email_hint AS emailHint, reason, detail, source, created_at AS createdAt FROM suppressions ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as any[]
  const total = (sqlite.prepare(`SELECT COUNT(*) AS n FROM suppressions ${w}`).get(...params) as { n: number }).n
  return { rows: rows.map(r => ({ ...r, createdAt: r.createdAt ? new Date(r.createdAt * 1000).toISOString() : null })), total }
})
