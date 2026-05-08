import { db } from '~/server/db/index'
import { contacts, lists, listContacts, campaigns, sends, trackingEvents, settings, loginAttempts } from '~/server/db/schema'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createBackup } from '~/server/utils/backup'
import { getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'

const VALID_SCOPES = ['all', 'db', 'contacts', 'campaigns', 'analytics', 'security', 'setup'] as const
type Scope = typeof VALID_SCOPES[number]

// Simple in-memory rate limit for destructive reset operations (3 per 10 min per IP)
const resetAttempts = new Map<string, { count: number; firstAt: number }>()
const RESET_MAX = 3
const RESET_WINDOW = 10 * 60 * 1000 // 10 minutes

function checkResetRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = resetAttempts.get(ip)
  if (!entry || now - entry.firstAt > RESET_WINDOW) {
    resetAttempts.set(ip, { count: 1, firstAt: now })
    return true
  }
  if (entry.count >= RESET_MAX) return false
  entry.count++
  return true
}

export default defineEventHandler(async (event) => {
  const ip = getClientIp(event)
  if (!checkResetRateLimit(ip)) {
    throw createError({ statusCode: 429, message: 'Too many reset requests. Try again in 10 minutes.' })
  }

  const body = await readBody(event)
  const scope = body?.scope as Scope

  if (!VALID_SCOPES.includes(scope)) {
    throw createError({ statusCode: 400, message: 'Invalid scope' })
  }

  // Setup reconfiguration: only delete config files, no DB backup needed
  if (scope === 'setup') {
    await fs.unlink(path.resolve(process.cwd(), 'data/.installed')).catch(() => {})
    await fs.unlink(path.resolve(process.cwd(), 'data/config.json')).catch(() => {})
    return { ok: true, backupPath: null }
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

  if (scope === 'analytics') {
    await safeDelete(trackingEvents)
  }

  else if (scope === 'security') {
    await safeDelete(loginAttempts)
  }

  else if (scope === 'contacts') {
    // tracking_events.contact_id and list_contacts.contact_id have cascade — but sends.contact_id does not
    await db.update(sends).set({ contactId: null })
    await safeDelete(listContacts)
    await safeDelete(contacts)
  }

  else if (scope === 'campaigns') {
    // tracking_events.campaign_id has cascade
    await safeDelete(campaigns) // sends also cascade
  }

  else if (scope === 'db' || scope === 'all') {
    // Deletion order to respect FKs (even with cascades, it's cleaner)
    await safeDelete(trackingEvents)
    await safeDelete(sends)
    await safeDelete(listContacts)
    await safeDelete(campaigns)
    await safeDelete(contacts)
    await safeDelete(lists)
    await safeDelete(settings)
    await safeDelete(loginAttempts)

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

  logAudit('reset', { scope, backupPath }, ip)
  return { ok: true, backupPath }
})
