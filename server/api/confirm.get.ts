import { sqlite } from '~/server/db/index'
import { verifyConfirmToken } from '~/server/utils/auth'
import { htmlPage } from '~/server/utils/confirm-page'

// Double opt-in link target. Shows a confirm button — it does NOT activate on
// GET: mail security scanners open every link and would "confirm" addresses
// nobody confirmed, defeating the whole point of double opt-in.
export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const contactId = Number(getQuery(event).c)
  const token = String(getQuery(event).t || '')
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')

  if (!contactId || !token || !verifyConfirmToken(contactId, token, String(config.unsubscribeSecret))) {
    setResponseStatus(event, 400)
    return htmlPage('Enlace no válido', 'El enlace de confirmación no es válido o ha caducado. Solicita la suscripción de nuevo.', false)
  }

  const contact = sqlite.prepare('SELECT id, status FROM contacts WHERE id = ?').get(contactId) as { id: number; status: string } | undefined
  if (!contact) {
    setResponseStatus(event, 404)
    return htmlPage('Contacto no encontrado', 'Este registro ya no existe.', false)
  }
  if (contact.status === 'active') {
    return htmlPage('Suscripción ya confirmada', 'Tu dirección ya estaba confirmada. No tienes que hacer nada más.', true)
  }

  return htmlPage(
    'Confirma tu suscripción',
    'Pulsa el botón para confirmar que quieres recibir nuestros emails.',
    false,
    { action: '/api/confirm', fields: { c: String(contactId), t: token }, button: 'Confirmar suscripción' },
  )
})
