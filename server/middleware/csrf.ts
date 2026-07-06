import { verifyCsrfToken } from '~/server/utils/csrf'

// Paths that must bypass CSRF (public endpoints or non-browser clients)
const BYPASS_PREFIXES = [
  '/api/auth/login',
  '/api/auth/csrf',
  // Se autentica con el refresh token en el body, no con la cookie de sesión
  '/api/auth/refresh',
  '/api/track/',
  '/api/unsubscribe',
  '/api/resubscribe',
  '/api/subscribe',
  '/api/subscribers',
  '/api/preferences',
  '/api/health',
  '/api/ghost-status',
]

export default defineEventHandler((event) => {
  const method = event.node.req.method ?? ''
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return

  const path = event.node.req.url ?? ''
  if (BYPASS_PREFIXES.some(p => path.startsWith(p))) return

  const sessionToken = getCookie(event, 'tm_session')
  if (!sessionToken) return // auth middleware will reject unauthenticated requests

  const csrfHeader = getHeader(event, 'x-csrf-token')
  if (!csrfHeader) {
    throw createError({ statusCode: 403, message: 'Missing CSRF token' })
  }

  const config = useServerConfig()
  const secret = String(config.unsubscribeSecret || '')
  if (!secret) return // server not configured yet (setup wizard)

  if (!verifyCsrfToken(csrfHeader, sessionToken, secret)) {
    throw createError({ statusCode: 403, message: 'Invalid CSRF token' })
  }
})
