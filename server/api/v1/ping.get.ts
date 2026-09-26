import { requireApiKey } from '~/server/utils/api-keys'
import { APP_VERSION } from '~/utils/version'

// GET /api/v1/ping — checks an API key (any scope it has).
export default defineEventHandler((event) => {
  let key
  for (const scope of ['send', 'contacts:read', 'contacts:write', 'events', 'campaigns:read'] as const) {
    try { key = requireApiKey(event, scope); break } catch (err: any) { if (err?.statusCode !== 403) throw err }
  }
  if (!key) throw createError({ statusCode: 403, statusMessage: 'API key has no scopes' })
  return { ok: true, key: key.name, scopes: key.scopes, version: APP_VERSION }
})
