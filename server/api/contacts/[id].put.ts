import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const fields = sanitizeContactFields(body)
  const { tags, status, listIds } = body

  if (!fields.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  if (!isValidEmail(fields.email)) throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })

  const [row] = await db.update(contacts).set({
    ...fields,
    tags: Array.isArray(tags) ? tags : [],
    status: status || 'active',
    updatedAt: new Date(),
  }).where(eq(contacts.id, id)).returning()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  if (Array.isArray(listIds)) {
    await db.delete(listContacts).where(eq(listContacts.contactId, id))
    if (listIds.length) {
      await db.insert(listContacts).values(listIds.map((listId: number) => ({ listId, contactId: id })))
    }
  }

  return row
})
