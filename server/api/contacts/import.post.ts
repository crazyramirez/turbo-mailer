import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

type ImportMode = 'upsert' | 'skipExisting' | 'updateOnly'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { rows, listId, importMode = 'upsert' } = body as { rows: any[]; listId?: number; importMode?: ImportMode }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'rows array required' })
  }
  if (rows.length > 5000) {
    throw createError({ statusCode: 400, statusMessage: 'Maximum 5000 rows per import' })
  }
  if (!['upsert', 'skipExisting', 'updateOnly'].includes(importMode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid importMode' })
  }

  // Validate and sanitize rows first
  const valid: { fields: ReturnType<typeof sanitizeContactFields> }[] = []
  let invalidCount = 0
  for (const row of rows) {
    const fields = sanitizeContactFields(row)
    if (!fields.email || !isValidEmail(fields.email)) { invalidCount++; continue }
    valid.push({ fields })
  }

  // Batch-fetch existing emails to distinguish insert vs update
  const allEmails = valid.map(v => v.fields.email as string)
  const existingRows = allEmails.length
    ? await db.select({ email: contacts.email, id: contacts.id })
        .from(contacts)
        .where(inArray(contacts.email, allEmails))
    : []
  const existingMap = new Map(existingRows.map(r => [r.email, r.id]))

  let inserted = 0
  let updated = 0
  let duplicates = 0
  let skipped = 0

  for (const { fields } of valid) {
    const email = fields.email as string
    const isExisting = existingMap.has(email)

    try {
      if (importMode === 'skipExisting' && isExisting) {
        duplicates++
        // Still add to list if requested
        if (listId) {
          const existingId = existingMap.get(email)!
          await db.insert(listContacts).values({ listId: Number(listId), contactId: existingId }).onConflictDoNothing()
        }
        continue
      }

      if (importMode === 'updateOnly' && !isExisting) {
        skipped++
        continue
      }

      if (importMode === 'updateOnly' && isExisting) {
        await db.update(contacts)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(contacts.email, email))
        updated++
        if (listId) {
          const existingId = existingMap.get(email)!
          await db.insert(listContacts).values({ listId: Number(listId), contactId: existingId }).onConflictDoNothing()
        }
        continue
      }

      // upsert mode
      const [contact] = await db.insert(contacts)
        .values({ ...fields, status: 'active', updatedAt: new Date() })
        .onConflictDoUpdate({ target: contacts.email, set: { ...fields, updatedAt: new Date() } })
        .returning()

      if (contact) {
        if (isExisting) updated++; else inserted++
        if (listId) {
          await db.insert(listContacts).values({ listId: Number(listId), contactId: contact.id }).onConflictDoNothing()
        }
      }
    } catch (e) {
      console.error('[import] error for email:', email, e)
      skipped++
    }
  }

  logAudit('contacts.import', { importMode, total: rows.length, inserted, updated, duplicates, skipped, invalidCount }, getClientIp(event))
  return { inserted, updated, duplicates, skipped, invalidCount, total: rows.length }
})
