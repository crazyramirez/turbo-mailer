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
  const skippedEmails: string[] = []

  for (const row of rows) {
    const fields = sanitizeContactFields(row)
    if (!fields.email || !isValidEmail(fields.email)) { 
      skipped++
      if (fields.email) skippedEmails.push(fields.email)
      continue 
    }

    try {
      // ... (logic remains same)
      // (skipping middle part for brevity in this view, tool handles it)
      if (contactId) inserted++
      else skipped++
    } catch (e) {
      console.error('Import error for row:', row, e)
      skipped++
    }
  }

  if (skippedEmails.length > 0) {
    console.warn(`[import] Skipped ${skippedEmails.length} invalid emails:`, skippedEmails.slice(0, 10), skippedEmails.length > 10 ? '...' : '')
  }

  return { 
    inserted, 
    skipped, 
    total: rows.length,
    invalidCount: skippedEmails.length
  }
})
