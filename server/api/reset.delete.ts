import { db } from '~/server/db/index'
import { contacts, lists, listContacts, campaigns, sends, trackingEvents, settings } from '~/server/db/schema'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createBackup } from '~/server/utils/backup'

const VALID_SCOPES = ['all', 'db', 'contacts', 'campaigns', 'analytics'] as const
type Scope = typeof VALID_SCOPES[number]

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const scope = body?.scope as Scope

  if (!VALID_SCOPES.includes(scope)) {
    throw createError({ statusCode: 400, message: 'Invalid scope' })
  }

  // Backup before any destructive operation
  const backupPath = await createBackup().catch(() => null)

  const safeDelete = async (table: any) => {
    try {
      await db.delete(table)
    } catch (e) {
      console.warn(`Could not delete from table:`, e)
    }
  }

  const safeUpdate = async (table: any, values: any) => {
    try {
      await db.update(table).set(values)
    } catch (e) {
      console.warn(`Could not update table:`, e)
    }
  }

  if (scope === 'analytics') {
    await safeDelete(trackingEvents)
  }

  else if (scope === 'contacts') {
    // Null out FK refs to contacts in child tables to avoid constraint violations
    await safeUpdate(sends, { contactId: null })
    await safeUpdate(trackingEvents, { contactId: null })
    // Null out listId in campaigns before deleting lists
    await safeUpdate(campaigns, { listId: null })
    await safeDelete(listContacts)
    await safeDelete(contacts)
    await safeDelete(lists)
  }

  else if (scope === 'campaigns') {
    // tracking_events.campaign_id and .send_id have no cascade — clear first
    await safeDelete(trackingEvents)
    await safeDelete(campaigns) // sends cascade via ON DELETE CASCADE
  }

  else if (scope === 'db' || scope === 'all') {
    await safeDelete(trackingEvents)
    await safeDelete(sends)
    await safeDelete(listContacts)
    await safeDelete(campaigns)
    await safeDelete(contacts)
    await safeDelete(lists)
    await safeDelete(settings)

    if (scope === 'all') {
      const templatesDir = path.resolve(process.cwd(), 'data/templates')
      const files = await fs.readdir(templatesDir).catch(() => [] as string[])
      await Promise.all(
        files
          .filter(f => f !== '.gitkeep')
          .map(f => fs.unlink(path.join(templatesDir, f)).catch(() => {}))
      )
    }
  }

  return { ok: true, backupPath }
})
