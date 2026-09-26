import { sqlite } from '~/server/db/index'
import { requireApiKey } from '~/server/utils/api-keys'
import { eraseContact } from '~/server/utils/gdpr'
import { getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'

// DELETE /api/v1/contacts?email=… — GDPR erasure (right to be forgotten).
export default defineEventHandler((event) => {
  const key = requireApiKey(event, 'contacts:write')
  const email = String(getQuery(event).email || '').trim()
  const c = sqlite.prepare('SELECT id FROM contacts WHERE email = ? COLLATE NOCASE').get(email) as { id: number } | undefined
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  eraseContact(c.id, { source: `api:${key.name}`, ip: getClientIp(event) })
  logAudit('contact.gdpr_erase', { via: 'api', key: key.name }, getClientIp(event))
  return { erased: true }
})
