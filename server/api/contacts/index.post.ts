import { sqlite, db } from '~/server/db/index'
import { contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'
import { getSuppression, unsuppress } from '~/server/utils/suppression'
import { sanitizeCustomValues } from '~/server/utils/custom-fields'
import { recordConsent } from '~/server/utils/consent'
import { emitContactEvent } from '~/server/utils/contact-events'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Manual contact creation. An address on the suppression list (unsubscribed,
// bounced, complained…) is never silently re-added as active: the admin
// gets a 409 "suppressed:<reason>" and must confirm with liftSuppression —
// except spam complaints, which can't be lifted from here.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const fields = sanitizeContactFields(body ?? {})
  const { tags, listIds, liftSuppression } = body ?? {}

  if (!fields.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  if (!isValidEmail(fields.email)) throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })
  if (sqlite.prepare('SELECT 1 FROM contacts WHERE email = ? COLLATE NOCASE').get(fields.email)) {
    throw createError({ statusCode: 409, statusMessage: 'Email already exists' })
  }

  const ip = getClientIp(event)
  const sup = getSuppression(fields.email)
  if (sup) {
    if (sup.reason === 'complained') {
      throw createError({ statusCode: 409, statusMessage: 'Esta dirección marcó un email como spam: no se puede volver a añadir (Entregabilidad → Supresión)' })
    }
    if (!liftSuppression) throw createError({ statusCode: 409, statusMessage: `suppressed:${sup.reason}` })
    unsuppress(fields.email)
    logAudit('contact.suppression_lifted', { email: fields.email, reason: sup.reason }, ip)
  }

  const cleanTags = Array.isArray(tags)
    ? [...new Set(tags.map((t: unknown) => String(t).trim().slice(0, 50)).filter(Boolean))].slice(0, 50)
    : []
  const custom = body?.custom && typeof body.custom === 'object' ? sanitizeCustomValues(body.custom) : {}
  for (const [k, v] of Object.entries(custom)) if (v === null) delete custom[k]
  const now = Math.floor(Date.now() / 1000)

  const id = sqlite.transaction(() => {
    const cid = Number(sqlite.prepare(
      `INSERT INTO contacts (email, name, company, role, phone, linkedin, url, youtube, instagram, tags, custom, locale, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'active', ?, ?)`,
    ).run(
      fields.email, fields.name, fields.company, fields.role, fields.phone, fields.linkedin, fields.url, fields.youtube, fields.instagram,
      JSON.stringify(cleanTags), Object.keys(custom).length ? JSON.stringify(custom) : null,
      typeof body?.locale === 'string' ? body.locale.slice(0, 10) || null : null, now, now,
    ).lastInsertRowid)
    const ids = (Array.isArray(listIds) ? listIds : []).map(Number).filter(n => Number.isInteger(n) && n > 0)
    const link = sqlite.prepare('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM lists WHERE id = ?)')
    for (const lid of ids) link.run(lid, cid, lid)
    return cid
  })()

  recordConsent({ contactId: id, email: fields.email, action: 'manual', source: sup ? `added-by-admin (was ${sup.reason})` : 'added-by-admin', ip })
  emitContactEvent({ type: 'subscribed', contactId: id, listIds: (Array.isArray(listIds) ? listIds : []).map(Number), source: 'manual' })
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id))
  return row
})
