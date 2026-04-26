import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const fields = sanitizeContactFields(body)
  const { tags, listIds } = body

  if (!fields.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  if (!isValidEmail(fields.email)) throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })

  try {
    const [row] = await db.insert(contacts).values({
      ...fields,
      tags: Array.isArray(tags) ? tags : [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning()

    if (Array.isArray(listIds) && listIds.length) {
      await db.insert(listContacts).values(listIds.map((listId: number) => ({ listId, contactId: row.id })))
    }

    return row
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      throw createError({ statusCode: 409, statusMessage: 'Email already exists' })
    }
    throw e
  }
})
