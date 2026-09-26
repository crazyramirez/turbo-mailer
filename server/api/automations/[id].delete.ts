import { sqlite } from '~/server/db/index'
import { invalidateAutomationCache } from '~/server/utils/contact-events'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Runs are removed (cascade); carrier campaigns stay for their send history.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const a = sqlite.prepare('SELECT name FROM automations WHERE id = ?').get(id) as { name: string } | undefined
  if (!a) throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
  sqlite.prepare('DELETE FROM automations WHERE id = ?').run(id)
  sqlite.prepare(`UPDATE campaigns SET name = '⚙ (eliminada) ' || name WHERE kind = 'automation' AND name LIKE ?`).run(`⚙ ${a.name} · %`)
  invalidateAutomationCache()
  logAudit('automation.delete', { id, name: a.name }, getClientIp(event))
  return { ok: true }
})
