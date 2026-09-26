import { sqlite } from '~/server/db/index'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Revocation is immediate and permanent (the row stays for the audit trail).
export default defineEventHandler((event) => {
  const id = Number(getQuery(event).id)
  const r = sqlite.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Math.floor(Date.now() / 1000), id)
  if (!r.changes) throw createError({ statusCode: 404, statusMessage: 'Key not found or already revoked' })
  logAudit('api_key.revoke', { id }, getClientIp(event))
  return { ok: true }
})
