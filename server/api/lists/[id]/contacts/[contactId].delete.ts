import { db } from '~/server/db/index'
import { listContacts } from '~/server/db/schema'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const listId = Number(getRouterParam(event, 'id'))
  const contactId = Number(getRouterParam(event, 'contactId'))

  await db.delete(listContacts).where(
    and(eq(listContacts.listId, listId), eq(listContacts.contactId, contactId))
  )

  return { success: true }
})
