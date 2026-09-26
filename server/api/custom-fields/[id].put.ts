import { sqlite } from '~/server/db/index'
import { invalidateCustomFieldCache } from '~/server/utils/custom-fields'

// Label and select options can change; key and type can't (data depends on them).
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const b = await readBody<{ label?: string; options?: string[] }>(event)
  const cur = sqlite.prepare('SELECT type FROM custom_fields WHERE id = ?').get(id) as { type: string } | undefined
  if (!cur) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  const label = String(b?.label || '').trim().slice(0, 80)
  if (!label) throw createError({ statusCode: 400, statusMessage: 'El campo necesita un nombre' })
  const options = cur.type === 'select' ? [...new Set((b?.options ?? []).map(o => String(o).trim()).filter(Boolean))].slice(0, 100) : null
  sqlite.prepare('UPDATE custom_fields SET label = ?, options = ? WHERE id = ?').run(label, options ? JSON.stringify(options) : null, id)
  invalidateCustomFieldCache()
  return { ok: true }
})
