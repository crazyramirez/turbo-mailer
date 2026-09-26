import { sqlite } from '~/server/db/index'
import { validateSegment, countSegmentRules } from '~/server/utils/segments'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const b = await readBody<{ name?: string; description?: string; rules?: unknown }>(event)
  const name = String(b?.name || '').trim().slice(0, 120)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'El segmento necesita un nombre' })
  let rules
  try { rules = validateSegment(b?.rules) } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  const now = Math.floor(Date.now() / 1000)
  const count = countSegmentRules(rules)
  const id = Number(sqlite.prepare(
    `INSERT INTO segments (name, description, rules, cached_count, cached_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(name, String(b?.description || '').slice(0, 500) || null, JSON.stringify(rules), count, now, now, now).lastInsertRowid)
  logAudit('segment.create', { id, name }, getClientIp(event))
  return { id, name, count }
})
