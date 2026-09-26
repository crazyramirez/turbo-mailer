import { exportContactData } from '~/server/utils/gdpr'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// GDPR access/portability: everything we hold about one contact, as JSON.
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const data = exportContactData(id)
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
  logAudit('contact.gdpr_export', { contactId: id }, getClientIp(event))
  setHeader(event, 'Content-Disposition', `attachment; filename="contacto-${id}.json"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return data
})
