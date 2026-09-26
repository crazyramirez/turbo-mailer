import { sqlite } from '~/server/db/index'
import { FIELD_KEY_RE, RESERVED_KEYS, invalidateCustomFieldCache, listCustomFields, normalizeFieldKey } from '~/server/utils/custom-fields'

const TYPES = ['text', 'number', 'date', 'boolean', 'select']

export default defineEventHandler(async (event) => {
  const b = await readBody<{ label?: string; key?: string; type?: string; options?: string[] }>(event)
  const label = String(b?.label || '').trim().slice(0, 80)
  if (!label) throw createError({ statusCode: 400, statusMessage: 'El campo necesita un nombre' })
  const key = String(b?.key || normalizeFieldKey(label))
  if (!FIELD_KEY_RE.test(key)) throw createError({ statusCode: 400, statusMessage: 'Clave no válida (minúsculas, números y _)' })
  if (RESERVED_KEYS.has(key)) throw createError({ statusCode: 400, statusMessage: `«${key}» está reservado` })
  if (listCustomFields().some(f => f.key === key)) throw createError({ statusCode: 409, statusMessage: `Ya existe el campo «${key}»` })
  const type = TYPES.includes(String(b?.type)) ? String(b!.type) : 'text'
  const options = type === 'select' ? [...new Set((b?.options ?? []).map(o => String(o).trim()).filter(Boolean))].slice(0, 100) : null
  if (type === 'select' && !options?.length) throw createError({ statusCode: 400, statusMessage: 'Un campo de selección necesita opciones' })
  const order = (sqlite.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM custom_fields').get() as { n: number }).n
  const id = Number(sqlite.prepare('INSERT INTO custom_fields (key, label, type, options, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(key, label, type, options ? JSON.stringify(options) : null, order, Math.floor(Date.now() / 1000)).lastInsertRowid)
  invalidateCustomFieldCache()
  return { id, key, label, type, options }
})
