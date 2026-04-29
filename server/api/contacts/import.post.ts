import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { sql, eq } from 'drizzle-orm'
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
      // 1. Upsert or get existing contact
      let contactId: number | null = null
      
      const [existing] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, fields.email))
      
      if (existing) {
        contactId = existing.id
        // Optional: Update existing contact fields
        await db.update(contacts).set({ ...fields, updatedAt: new Date() }).where(eq(contacts.id, contactId))
      } else {
        const [insertedRow] = await db.insert(contacts).values({
          ...fields,
          tags: [],
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning()
        if (insertedRow) contactId = insertedRow.id
      }

      if (contactId && listId) {
        await db.insert(listContacts)
          .values({ listId: Number(listId), contactId })
          .onConflictDoNothing()
      }

      if (contactId) inserted++
      else skipped++
    } catch (e) {
      console.error('Import error for row:', row, e)
      skipped++
    }
  }

  return { inserted, skipped, total: rows.length }
})
