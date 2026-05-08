import { db } from '~/server/db/index'
import { contacts, listContacts, sends } from '~/server/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

type BulkAction = 'delete' | 'addToList' | 'removeFromList'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { action, ids, listId } = body as { action: BulkAction; ids: number[]; listId?: number }

  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'ids array required' })
  }
  if (ids.length > 5000) {
    throw createError({ statusCode: 400, statusMessage: 'Maximum 5000 ids per bulk operation' })
  }
  if (!['delete', 'addToList', 'removeFromList'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid action' })
  }

  const ip = getClientIp(event)

  if (action === 'delete') {
    // Nullify contact_id in sends (no cascade) before deleting
    await db.update(sends).set({ contactId: null }).where(inArray(sends.contactId, ids))
    await db.delete(contacts).where(inArray(contacts.id, ids))
    logAudit('contacts.bulk_delete', { count: ids.length }, ip)
    return { ok: true, affected: ids.length }
  }

  if (action === 'addToList') {
    if (!listId) throw createError({ statusCode: 400, statusMessage: 'listId required for addToList' })
    await db.insert(listContacts)
      .values(ids.map(contactId => ({ listId: Number(listId), contactId })))
      .onConflictDoNothing()
    logAudit('contacts.bulk_add_to_list', { count: ids.length, listId }, ip)
    return { ok: true, affected: ids.length }
  }

  if (action === 'removeFromList') {
    if (!listId) throw createError({ statusCode: 400, statusMessage: 'listId required for removeFromList' })
    await db.delete(listContacts).where(
      inArray(listContacts.contactId, ids)
    )
    logAudit('contacts.bulk_remove_from_list', { count: ids.length, listId }, ip)
    return { ok: true, affected: ids.length }
  }
})
