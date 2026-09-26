import { sqlite } from '~/server/db/index'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Removes a suppression entry. Complaints need explicit confirmation: mailing
// someone who reported you as spam is the fastest way to a blocklist.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const force = getQuery(event).force === '1'
  const row = sqlite.prepare('SELECT id, reason, email_hint AS hint FROM suppressions WHERE id = ?').get(id) as { id: number; reason: string; hint: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.reason === 'complained' && !force) {
    throw createError({ statusCode: 409, statusMessage: 'complaint_requires_force' })
  }
  sqlite.prepare('DELETE FROM suppressions WHERE id = ?').run(id)
  logAudit('suppression.remove', { id, reason: row.reason, hint: row.hint }, getClientIp(event))
  return { ok: true }
})
