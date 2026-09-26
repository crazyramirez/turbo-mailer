import { sqlite } from '~/server/db/index'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'
import { getSuppression, suppress, unsuppress } from '~/server/utils/suppression'
import { sanitizeCustomValues } from '~/server/utils/custom-fields'
import { recordConsent } from '~/server/utils/consent'
import { emitContactEvent } from '~/server/utils/contact-events'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Manual contact edit. Status changes stay consistent with the suppression
// list: marking someone unsubscribed/bounced suppresses them; bringing a
// suppressed address back requires an explicit liftSuppression (and a
// spam complaint can't be lifted from here at all).
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const fields = sanitizeContactFields(body)
  const { tags, status, listIds, liftSuppression } = body ?? {}

  if (!fields.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  if (!isValidEmail(fields.email)) throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })

  const cur = sqlite.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, any> | undefined
  if (!cur) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  const clash = sqlite.prepare('SELECT id FROM contacts WHERE email = ? COLLATE NOCASE AND id != ?').get(fields.email, id)
  if (clash) throw createError({ statusCode: 409, statusMessage: 'Email already exists' })

  const STATUSES = ['active', 'unsubscribed', 'bounced', 'inactive']
  let nextStatus = STATUSES.includes(status) ? status : cur.status
  const sup = getSuppression(fields.email)
  const ip = getClientIp(event)

  if (nextStatus === 'active' && sup) {
    if (!liftSuppression) {
      throw createError({ statusCode: 409, statusMessage: `suppressed:${sup.reason}` })
    }
    if (sup.reason === 'complained') {
      throw createError({ statusCode: 409, statusMessage: 'Esta dirección marcó un email como spam: no se puede reactivar desde aquí (Entregabilidad → Supresión)' })
    }
    unsuppress(fields.email)
    recordConsent({ contactId: id, email: fields.email, action: 'manual', source: `reactivated-by-admin (was ${sup.reason})`, ip })
    logAudit('contact.suppression_lifted', { contactId: id, reason: sup.reason }, ip)
  }
  if (nextStatus === 'unsubscribed' && cur.status !== 'unsubscribed') {
    suppress(fields.email, 'manual', 'marked unsubscribed by admin', 'admin')
    recordConsent({ contactId: id, email: fields.email, action: 'unsubscribe', source: 'admin', ip })
  }
  if (nextStatus === 'bounced' && cur.status !== 'bounced') suppress(fields.email, 'bounced', 'marked bounced by admin', 'admin')

  const prevTags: string[] = (() => { try { return JSON.parse(cur.tags || '[]') } catch { return [] } })()
  const nextTags: string[] = Array.isArray(tags)
    ? [...new Set(tags.map((t: unknown) => String(t).trim().slice(0, 50)).filter(Boolean))].slice(0, 50) as string[]
    : prevTags
  const curCustom = (() => { try { return JSON.parse(cur.custom || '{}') || {} } catch { return {} } })()
  const custom = body?.custom && typeof body.custom === 'object' ? { ...curCustom, ...sanitizeCustomValues(body.custom) } : curCustom
  for (const [k, v] of Object.entries(custom)) if (v === null) delete custom[k]
  const locale = typeof body?.locale === 'string' ? body.locale.slice(0, 10) || null : cur.locale

  sqlite.prepare(
    `UPDATE contacts SET email = ?, name = ?, company = ?, role = ?, phone = ?, linkedin = ?, url = ?, youtube = ?, instagram = ?,
       tags = ?, custom = ?, locale = ?, status = ?, updated_at = ? WHERE id = ?`,
  ).run(fields.email, fields.name, fields.company, fields.role, fields.phone, fields.linkedin, fields.url, fields.youtube, fields.instagram,
    JSON.stringify(nextTags), Object.keys(custom).length ? JSON.stringify(custom) : null, locale, nextStatus, Math.floor(Date.now() / 1000), id)

  if (Array.isArray(listIds)) {
    const before = new Set((sqlite.prepare('SELECT list_id AS id FROM list_contacts WHERE contact_id = ?').all(id) as { id: number }[]).map(r => r.id))
    const wanted = [...new Set(listIds.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    sqlite.transaction(() => {
      sqlite.prepare('DELETE FROM list_contacts WHERE contact_id = ?').run(id)
      const ins = sqlite.prepare('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)')
      wanted.forEach(l => ins.run(l, id))
    })()
    if (nextStatus === 'active') wanted.filter(l => !before.has(l)).forEach(l => emitContactEvent({ type: 'list_added', contactId: id, listId: l }))
  }
  if (nextStatus === 'active') {
    const lower = new Set(prevTags.map(t => t.toLowerCase()))
    nextTags.filter(t => !lower.has(t.toLowerCase())).forEach(tag => emitContactEvent({ type: 'tag_added', contactId: id, tag }))
  }

  return sqlite.prepare('SELECT * FROM contacts WHERE id = ?').get(id)
})
