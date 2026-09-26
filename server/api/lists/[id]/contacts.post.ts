import { sqlite } from '~/server/db/index'
import { emitContactEvent } from '~/server/utils/contact-events'

export default defineEventHandler(async (event) => {
  const listId = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { contactId, contactIds } = body ?? {}

  const ids: number[] = (contactIds ? contactIds.map(Number) : contactId ? [Number(contactId)] : [])
    .filter((n: number) => Number.isInteger(n) && n > 0)
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'contactId or contactIds required' })
  if (!sqlite.prepare('SELECT 1 FROM lists WHERE id = ?').get(listId)) throw createError({ statusCode: 404, statusMessage: 'List not found' })

  const added: number[] = []
  const ins = sqlite.prepare('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)')
  sqlite.transaction(() => {
    for (const cid of ids) if (ins.run(listId, cid).changes) added.push(cid)
  })()
  // Automations triggered by "added to list"
  const active = new Set((sqlite.prepare(`SELECT id FROM contacts WHERE status = 'active' AND id IN (SELECT contact_id FROM list_contacts WHERE list_id = ?)`).all(listId) as { id: number }[]).map(r => r.id))
  added.filter(cid => active.has(cid)).forEach(cid => emitContactEvent({ type: 'list_added', contactId: cid, listId }))

  return { assigned: ids.length, added: added.length }
})
