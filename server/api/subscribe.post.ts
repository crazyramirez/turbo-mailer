import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const secret = event.headers.get('x-api-key') || event.headers.get('authorization')?.replace('Bearer ', '') || ''

  if (!config.apiSecret || secret !== config.apiSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const fields = sanitizeContactFields(body)
  const { tags, listIds } = body

  if (!fields.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  if (!isValidEmail(fields.email)) throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })

  try {
    const [existing] = await db.select().from(contacts).where(eq(contacts.email, fields.email))

    if (existing) {
      const [updated] = await db.update(contacts).set({
        ...fields,
        tags: Array.isArray(tags) ? tags : existing.tags,
        status: 'active',
        updatedAt: new Date(),
      }).where(eq(contacts.id, existing.id)).returning()

      return updated
    } else {
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
    }
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      throw createError({ statusCode: 409, statusMessage: 'Email already exists' })
    }
    throw e
  }
})
