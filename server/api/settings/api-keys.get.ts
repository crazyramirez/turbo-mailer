import { sqlite } from '~/server/db/index'
import { API_SCOPES } from '~/server/utils/api-keys'

export default defineEventHandler(() => {
  const rows = sqlite.prepare(
    `SELECT id, name, prefix, scopes, last_used_at AS lastUsedAt, revoked_at AS revokedAt, created_at AS createdAt FROM api_keys ORDER BY id DESC`,
  ).all() as any[]
  const iso = (v: number | null) => (v ? new Date(v * 1000).toISOString() : null)
  return {
    scopes: API_SCOPES,
    keys: rows.map(r => ({ ...r, scopes: JSON.parse(r.scopes || '[]'), lastUsedAt: iso(r.lastUsedAt), revokedAt: iso(r.revokedAt), createdAt: iso(r.createdAt) })),
  }
})
