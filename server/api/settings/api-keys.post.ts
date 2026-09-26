import { createApiKey } from '~/server/utils/api-keys'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// The raw key is returned ONCE — only its hash is stored.
export default defineEventHandler(async (event) => {
  const b = await readBody<{ name?: string; scopes?: string[] }>(event)
  const name = String(b?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Pon un nombre a la clave (p. ej. la integración que la usa)' })
  const created = createApiKey(name, Array.isArray(b?.scopes) ? b!.scopes : [])
  logAudit('api_key.create', { id: created.id, name, prefix: created.prefix }, getClientIp(event))
  return created
})
