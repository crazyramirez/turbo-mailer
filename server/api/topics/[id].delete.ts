import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  sqlite.transaction(() => {
    sqlite.prepare('UPDATE campaigns SET topic_id = NULL WHERE topic_id = ?').run(id)
    sqlite.prepare('DELETE FROM topics WHERE id = ?').run(id)
  })()
  return { ok: true }
})
