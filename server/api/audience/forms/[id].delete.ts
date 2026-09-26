import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  sqlite.prepare('DELETE FROM forms WHERE id = ?').run(id)
  return { ok: true }
})
