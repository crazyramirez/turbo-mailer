import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { sql } from 'drizzle-orm'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { rows, listId } = body

  if (!Array.isArray(rows) || rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'rows array required' })
  }

  if (rows.length > 5000) {
    throw createError({ statusCode: 400, statusMessage: 'Maximum 5000 rows per import' })
  }

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const fields = sanitizeContactFields(row)
    if (!fields.email || !isValidEmail(fields.email)) { skipped++; continue }

    try {
      const [contact] = await db.insert(contacts).values({
        ...fields,
        tags: [],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing().returning()

      if (contact && listId) {
        await db.insert(listContacts)
          .values({ listId: Number(listId), contactId: contact.id })
          .onConflictDoNothing()
      }

      if (contact) inserted++
      else skipped++
    } catch {
      skipped++
    }
  }

  return { inserted, skipped, total: rows.length }
})
