import { sqlite } from '~/server/db/index'
import { validateSegment, countSegmentRules } from '~/server/utils/segments'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const b = await readBody<{ name?: string; description?: string; rules?: unknown }>(event)
  const cur = sqlite.prepare('SELECT id FROM segments WHERE id = ?').get(id)
  if (!cur) throw createError({ statusCode: 404, statusMessage: 'Segment not found' })
  const name = String(b?.name || '').trim().slice(0, 120)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'El segmento necesita un nombre' })
  let rules
  try { rules = validateSegment(b?.rules) } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  const now = Math.floor(Date.now() / 1000)
  const count = countSegmentRules(rules)
  sqlite.prepare('UPDATE segments SET name = ?, description = ?, rules = ?, cached_count = ?, cached_at = ?, updated_at = ? WHERE id = ?')
    .run(name, String(b?.description || '').slice(0, 500) || null, JSON.stringify(rules), count, now, now, id)
  return { id, name, count }
})
