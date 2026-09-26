import { sqlite } from '~/server/db/index'
import { enrollContact } from '~/server/utils/contact-events'
import { evaluateSegmentById } from '~/server/utils/segments'
import { processDueRuns } from '~/server/utils/automation-engine'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Puts existing contacts into an active automation: one contact (by email),
// a whole list or a segment.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const a = sqlite.prepare('SELECT status, allow_reentry AS reentry FROM automations WHERE id = ?').get(id) as { status: string; reentry: number } | undefined
  if (!a) throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
  if (a.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'Activa la automatización antes de añadir contactos' })
  const b = await readBody<{ email?: string; listId?: number; segmentId?: number }>(event)

  let ids: number[] = []
  if (b?.email) {
    const c = sqlite.prepare(`SELECT id FROM contacts WHERE email = ? COLLATE NOCASE AND status = 'active'`).get(String(b.email).trim()) as { id: number } | undefined
    if (!c) throw createError({ statusCode: 404, statusMessage: 'No hay ningún contacto activo con ese email' })
    ids = [c.id]
  } else if (b?.listId) {
    ids = (sqlite.prepare(`SELECT c.id FROM contacts c JOIN list_contacts lc ON lc.contact_id = c.id WHERE lc.list_id = ? AND c.status = 'active'`).all(Number(b.listId)) as { id: number }[]).map(r => r.id)
  } else if (b?.segmentId) {
    ids = (await evaluateSegmentById(Number(b.segmentId))).map((c: any) => c.id)
  } else {
    throw createError({ statusCode: 400, statusMessage: 'Indica email, lista o segmento' })
  }

  let enrolled = 0
  sqlite.transaction(() => {
    for (const cid of ids) if (enrollContact(id, cid, { event: { type: 'manual' } }, !!a.reentry)) enrolled++
  })()
  logAudit('automation.enroll', { id, requested: ids.length, enrolled }, getClientIp(event))
  if (enrolled) void processDueRuns()
  return { requested: ids.length, enrolled }
})
