import { sqlite } from '~/server/db/index'
import { requireApiKey } from '~/server/utils/api-keys'
import { emitContactEvent } from '~/server/utils/contact-events'
import { processDueRuns } from '~/server/utils/automation-engine'

/**
 * POST /api/v1/events — custom event for a contact (e.g. "order.completed",
 * "trial.ended"). Starts automations whose trigger is that event.
 * Body: { email, event, data? }
 */
export default defineEventHandler(async (event) => {
  requireApiKey(event, 'events')
  const b = await readBody<{ email?: string; event?: string; data?: Record<string, unknown> }>(event)
  const name = String(b?.event || '').trim()
  if (!/^[\w.:-]{1,60}$/.test(name)) throw createError({ statusCode: 400, statusMessage: 'Invalid event name' })
  const c = sqlite.prepare('SELECT id, status FROM contacts WHERE email = ? COLLATE NOCASE').get(String(b?.email || '').trim()) as { id: number; status: string } | undefined
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Contact not found — create it with POST /api/v1/contacts first' })
  const before = (sqlite.prepare('SELECT COUNT(*) AS n FROM automation_runs WHERE contact_id = ?').get(c.id) as { n: number }).n
  if (c.status === 'active') emitContactEvent({ type: 'api_event', contactId: c.id, event: name, data: b?.data })
  const after = (sqlite.prepare('SELECT COUNT(*) AS n FROM automation_runs WHERE contact_id = ?').get(c.id) as { n: number }).n
  if (after > before) void processDueRuns()
  return { accepted: true, automationsStarted: after - before }
})
