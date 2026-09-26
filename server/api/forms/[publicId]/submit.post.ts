import { sqlite } from '~/server/db/index'
import { loadForm, checkFormToken, rateLimited, verifyTurnstile } from '~/server/utils/forms'
import { subscribeContact } from '~/server/utils/subscribe'
import { getClientIp } from '~/server/utils/auth'
import { emitContactEvent } from '~/server/utils/contact-events'

// Public form submission. Always answers with the same success message for
// suppressed addresses — never reveal whether an address is on file.
export default defineEventHandler(async (event) => {
  const publicId = String(getRouterParam(event, 'publicId') || '')
  const form = /^[\w-]{6,40}$/.test(publicId) ? loadForm('public', publicId) : null
  if (!form || !form.enabled) throw createError({ statusCode: 404, message: 'Formulario no disponible' })

  const ip = getClientIp(event)
  if (rateLimited(`${publicId}:${ip}`)) throw createError({ statusCode: 429, message: 'Demasiados intentos. Inténtalo más tarde.' })

  const body = await readBody<Record<string, any>>(event).catch(() => ({} as Record<string, any>))
  const en = String(useServerConfig().defaultLocale || 'es').startsWith('en')
  const okResponse = () => ({
    ok: true,
    redirect: form.redirectUrl && /^https?:\/\//i.test(form.redirectUrl) ? form.redirectUrl : null,
    title: en ? 'Thanks!' : '¡Gracias!',
    message: form.successMessage || (form.doubleOptIn
      ? (en ? 'Check your inbox to confirm your subscription.' : 'Revisa tu bandeja de entrada para confirmar la suscripción.')
      : (en ? 'You are subscribed.' : 'Te has suscrito correctamente.')),
  })

  // Honeypot filled → pretend success, store nothing
  if (String(body.website_url || '').trim()) return okResponse()
  const tok = checkFormToken(publicId, String(body.__t || ''))
  if (tok === 'too_fast') return okResponse()
  if (tok !== 'ok') throw createError({ statusCode: 400, message: en ? 'The form expired, reload the page.' : 'El formulario ha caducado, recarga la página.' })
  if (!(await verifyTurnstile(String(body['cf-turnstile-response'] || ''), ip))) {
    throw createError({ statusCode: 400, message: en ? 'Verification failed.' : 'No se pudo verificar que no eres un robot.' })
  }
  if (form.consentText && String(body.__consent) !== 'true') {
    throw createError({ statusCode: 400, message: en ? 'Please accept the consent terms.' : 'Debes aceptar el consentimiento.' })
  }

  const raw: Record<string, any> = {}
  const custom: Record<string, any> = {}
  for (const f of form.fields) {
    const v = body[f.key]
    if (f.required && (v === undefined || String(v).trim() === '')) {
      throw createError({ statusCode: 400, message: `${f.label}: ${en ? 'required' : 'obligatorio'}` })
    }
    if (v === undefined) continue
    if (f.key.startsWith('custom.')) custom[f.key.slice(7)] = f.type === 'checkbox' ? String(v) === 'true' : v
    else raw[f.key] = v
  }

  const result = subscribeContact({
    raw,
    tags: form.tags,
    listIds: form.listId ? [form.listId] : [],
    custom,
    source: `form:${form.id}`,
    ip,
    userAgent: getHeader(event, 'user-agent') ?? null,
    consentText: form.consentText,
    doubleOptIn: form.doubleOptIn,
  })

  if (result.status === 'rejected' && result.reason === 'invalid_email') {
    throw createError({ statusCode: 400, message: en ? 'Invalid email address.' : 'El email no es válido.' })
  }
  if (result.status !== 'rejected') {
    sqlite.prepare('UPDATE forms SET submissions = COALESCE(submissions, 0) + 1 WHERE id = ?').run(form.id)
    if (result.status !== 'pending_confirmation') {
      emitContactEvent({ type: 'form_submitted', contactId: result.contactId, formId: form.id })
    }
  }
  return okResponse()
})
