import { sqlite } from '~/server/db/index'
import { verifyConfirmToken, getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { emitWebhook } from '~/server/utils/webhook'
import { htmlPage } from '~/server/utils/confirm-page'
import { getSuppression, unsuppressIfOptOut } from '~/server/utils/suppression'
import { recordConsent } from '~/server/utils/consent'
import { emitContactEvent } from '~/server/utils/contact-events'

// Double opt-in confirmation (button on the page served by confirm.get.ts).
export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')

  const body = await readBody(event).catch(() => ({})) as Record<string, any>
  const contactId = Number(body?.c)
  const token = String(body?.t || '')

  if (!contactId || !token || !verifyConfirmToken(contactId, token, String(config.unsubscribeSecret))) {
    setResponseStatus(event, 400)
    return htmlPage('Enlace no válido', 'El enlace de confirmación no es válido o ha caducado. Solicita la suscripción de nuevo.', false)
  }

  const contact = sqlite.prepare('SELECT id, email, status FROM contacts WHERE id = ?').get(contactId) as { id: number; email: string; status: string } | undefined
  if (!contact) {
    setResponseStatus(event, 404)
    return htmlPage('Contacto no encontrado', 'Este registro ya no existe.', false)
  }
  if (contact.status === 'active') {
    return htmlPage('Suscripción ya confirmada', 'Tu dirección ya estaba confirmada. No tienes que hacer nada más.', true)
  }
  // An unsubscribed contact comes back only via a NEW subscription request
  // (which moves it to 'inactive' and mails a fresh link) — never via an old link.
  if (contact.status !== 'inactive') {
    setResponseStatus(event, 400)
    return htmlPage('No se pudo confirmar', 'Esta dirección no está pendiente de confirmación. Suscríbete de nuevo si quieres recibir nuestros emails.', false)
  }
  const sup = getSuppression(contact.email)
  if (sup && sup.reason !== 'unsubscribed' && sup.reason !== 'manual') {
    setResponseStatus(event, 400)
    return htmlPage('No se pudo confirmar', 'Esta dirección no puede recibir emails.', false)
  }

  unsuppressIfOptOut(contact.email)
  sqlite.prepare(`UPDATE contacts SET status = 'active', fail_count = 0, updated_at = ? WHERE id = ?`).run(Math.floor(Date.now() / 1000), contactId)

  const ip = getClientIp(event)
  recordConsent({ contactId, email: contact.email, action: 'confirm', source: 'double-opt-in', ip, userAgent: getHeader(event, 'user-agent') ?? null })
  logAudit('contact.confirm_opt_in', { contactId, email: contact.email }, ip)
  emitWebhook('contact.subscribe_confirmed', { contactId, email: contact.email })
  const listIds = (sqlite.prepare('SELECT list_id AS id FROM list_contacts WHERE contact_id = ?').all(contactId) as { id: number }[]).map(r => r.id)
  emitContactEvent({ type: 'subscribed', contactId, listIds, source: 'double-opt-in' })

  return htmlPage('¡Suscripción confirmada!', 'Tu dirección ha sido verificada. Ya formas parte de la lista.', true)
})
