import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const used = sqlite.prepare(`SELECT COUNT(*) AS n FROM campaigns WHERE segment_id = ? AND status IN ('draft', 'scheduled', 'sending', 'paused')`).get(id) as { n: number }
  if (used.n) throw createError({ statusCode: 409, statusMessage: `Lo usan ${used.n} campaña(s) sin terminar` })
  sqlite.prepare('DELETE FROM segments WHERE id = ?').run(id)
  return { ok: true }
})
