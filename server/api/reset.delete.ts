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

  if (scope === 'analytics') {
    await db.delete(trackingEvents)
  }

  else if (scope === 'contacts') {
    // Null out FK refs to contacts in child tables to avoid constraint violations
    await db.update(sends).set({ contactId: null })
    await db.update(trackingEvents).set({ contactId: null })
    // Null out listId in campaigns before deleting lists
    await db.update(campaigns).set({ listId: null })
    await db.delete(listContacts)
    await db.delete(contacts)
    await db.delete(lists)
  }

  else if (scope === 'campaigns') {
    // tracking_events.campaign_id and .send_id have no cascade — clear first
    await db.delete(trackingEvents)
    await db.delete(campaigns) // sends cascade via ON DELETE CASCADE
  }

  else if (scope === 'db' || scope === 'all') {
    await db.delete(trackingEvents)
    await db.delete(sends)
    await db.delete(listContacts)
    await db.delete(campaigns)
    await db.delete(contacts)
    await db.delete(lists)
    await db.delete(settings)

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
