import { randomBytes } from 'node:crypto'
import { loadForm, renderFormPage, formToken } from '~/server/utils/forms'

// Hosted subscription form: /f/<publicId>  (add ?embed=1 inside iframes)
export default defineEventHandler((event) => {
  const publicId = String(getRouterParam(event, 'id') || '')
  const form = /^[\w-]{6,40}$/.test(publicId) ? loadForm('public', publicId) : null
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  if (!form || !form.enabled) {
    setResponseStatus(event, 404)
    return '<!DOCTYPE html><meta charset="utf-8"><title>No disponible</title><p style="font-family:sans-serif;text-align:center;margin-top:40px">Este formulario no está disponible.</p>'
  }
  const config = useServerConfig()
  const nonce = randomBytes(16).toString('base64')
  const siteKey = config.turnstileSiteKey && config.turnstileSecret ? String(config.turnstileSiteKey) : null
  const embedded = getQuery(event).embed === '1'

  // This page is meant to be framed by the customer's website
  removeResponseHeader(event, 'X-Frame-Options')
  setHeader(event, 'Content-Security-Policy', [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'${siteKey ? ' https://challenges.cloudflare.com' : ''}`,
    "style-src 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    siteKey ? 'frame-src https://challenges.cloudflare.com' : "frame-src 'none'",
    'frame-ancestors *',
    "form-action 'self'",
    "base-uri 'none'",
  ].join('; '))

  const lang = String(config.defaultLocale || 'es')
  return renderFormPage(form, { nonce, embedded, siteKey, lang }).replace('"__TOKEN__"', JSON.stringify(formToken(form.publicId)))
})
