import { db } from '~/server/db/index'
import { contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyConfirmToken } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { emitWebhook } from '~/server/utils/webhook'
import { getClientIp } from '~/server/utils/auth'

// Double opt-in confirmation link target. Public, HMAC-protected.
// Flips the contact from 'inactive' (pending confirmation) to 'active'.

function htmlPage(title: string, message: string, ok: boolean): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{background:#1e293b;border-radius:18px;padding:40px 32px;max-width:420px;text-align:center;}
  .icon{font-size:44px;margin-bottom:16px;}
  h1{font-size:20px;margin:0 0 12px;}
  p{font-size:14px;color:#94a3b8;line-height:1.6;margin:0;}
</style></head>
<body><div class="card">
  <div class="icon">${ok ? '✅' : '⚠️'}</div>
  <h1>${title}</h1>
  <p>${message}</p>
</div></body></html>`
}

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
    return htmlPage(
      'Enlace no válido',
      'El enlace de confirmación no es válido o ha caducado. Solicita la suscripción de nuevo.',
      false,
    )
  }

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId))
  if (!contact) {
    setResponseStatus(event, 404)
    return htmlPage('Contacto no encontrado', 'Este registro ya no existe.', false)
  }

  if (contact.status === 'active') {
    return htmlPage('Suscripción ya confirmada', 'Tu dirección ya estaba confirmada. No tienes que hacer nada más.', true)
  }

  // Unsubscribed contacts must use the resubscribe flow, not an old confirm link
  if (contact.status === 'unsubscribed') {
    setResponseStatus(event, 400)
    return htmlPage(
      'Suscripción cancelada',
      'Esta dirección se dio de baja. Si quieres volver a recibir comunicaciones, suscríbete de nuevo.',
      false,
    )
  }

  await db.update(contacts)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(contacts.id, contactId))

  logAudit('contact.confirm_opt_in', { contactId, email: contact.email }, getClientIp(event))
  emitWebhook('contact.subscribe_confirmed', { contactId, email: contact.email })

  return htmlPage('¡Suscripción confirmada!', 'Tu dirección ha sido verificada. Ya formas parte de la lista.', true)
})
