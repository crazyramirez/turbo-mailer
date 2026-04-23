import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  // rows: array of { email, name, company, phone, linkedin, url, youtube, instagram }
  // listId: optional list to add contacts to
  const { rows, listId } = body

  if (!Array.isArray(rows) || rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'rows array required' })
  }

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const email = row.email?.trim()?.toLowerCase()
    if (!email) { skipped++; continue }

    try {
      const [contact] = await db.insert(contacts).values({
        email,
        name: row.name?.trim() || null,
        company: row.company?.trim() || null,
        phone: row.phone?.trim() || null,
        linkedin: row.linkedin?.trim() || null,
        url: row.url?.trim() || null,
        youtube: row.youtube?.trim() || null,
        instagram: row.instagram?.trim() || null,
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
