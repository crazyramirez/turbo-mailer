import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const b = await readBody<{ name?: string; description?: string; isPublic?: boolean; sortOrder?: number }>(event)
  const name = String(b?.name || '').trim().slice(0, 80)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'El tema necesita un nombre' })
  const r = sqlite.prepare('UPDATE topics SET name = ?, description = ?, is_public = ?, sort_order = COALESCE(?, sort_order) WHERE id = ?')
    .run(name, String(b?.description || '').slice(0, 300) || null, b?.isPublic === false ? 0 : 1, Number.isFinite(Number(b?.sortOrder)) ? Number(b!.sortOrder) : null, id)
  if (!r.changes) throw createError({ statusCode: 404, statusMessage: 'Topic not found' })
  return { ok: true }
})
