import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  const memberships = await db.select({ listId: listContacts.listId }).from(listContacts).where(eq(listContacts.contactId, id))
  return { ...row, listIds: memberships.map(m => m.listId) }
})
