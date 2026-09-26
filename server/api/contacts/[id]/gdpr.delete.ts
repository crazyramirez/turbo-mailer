import { eraseContact } from '~/server/utils/gdpr'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// GDPR erasure: deletes the contact, anonymizes its send/tracking history and
// keeps only a hash so the address is never mailed again.
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const ip = getClientIp(event)
  if (!eraseContact(id, { source: 'admin', ip })) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  logAudit('contact.gdpr_erase', { contactId: id, via: 'admin' }, ip)
  return { erased: true }
})
