import { sqlite } from '~/server/db/index'
import { invalidateCustomFieldCache } from '~/server/utils/custom-fields'

// Deletes the definition and its values from every contact.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const f = sqlite.prepare('SELECT key FROM custom_fields WHERE id = ?').get(id) as { key: string } | undefined
  if (!f) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  const inSegments = (sqlite.prepare(`SELECT COUNT(*) AS n FROM segments WHERE rules LIKE ?`).get(`%"custom.${f.key}"%`) as { n: number }).n
  if (inSegments && getQuery(event).force !== '1') {
    throw createError({ statusCode: 409, statusMessage: `Lo usan ${inSegments} segmento(s)` })
  }
  sqlite.transaction(() => {
    sqlite.prepare(`UPDATE contacts SET custom = json_remove(custom, '$.' || ?) WHERE custom IS NOT NULL`).run(f.key)
    sqlite.prepare('DELETE FROM custom_fields WHERE id = ?').run(id)
  })()
  invalidateCustomFieldCache()
  return { ok: true }
})
