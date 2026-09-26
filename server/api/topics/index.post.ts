import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const b = await readBody<{ name?: string; description?: string; isPublic?: boolean }>(event)
  const name = String(b?.name || '').trim().slice(0, 80)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'El tema necesita un nombre' })
  const order = (sqlite.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM topics').get() as { n: number }).n
  const id = Number(sqlite.prepare('INSERT INTO topics (name, description, is_public, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, String(b?.description || '').slice(0, 300) || null, b?.isPublic === false ? 0 : 1, order, Math.floor(Date.now() / 1000)).lastInsertRowid)
  return { id, name }
})
