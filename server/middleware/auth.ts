import { resolveSession, requiredRoleFor, roleAtLeast } from '~/server/utils/users'

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/mode',
  '/api/track/open',
  '/api/track/click',
  '/api/unsubscribe',
  '/api/resubscribe',
  '/api/preferences',
  '/api/subscribers',
  '/api/subscribe',
  '/api/confirm',
  '/api/ghost-status',
  '/api/setup/',
  '/api/health',
  '/api/forms/',
  '/api/v1/',
  '/api/webhooks/',
  '/api/metrics',
]

export default defineEventHandler(async (event) => {
  const path = event.path ?? getRequestURL(event).pathname

  if (!path.startsWith('/api/')) return

  if (PUBLIC_PATHS.some(p => path.startsWith(p))) return

  const auth = resolveSession(getCookie(event, 'tm_session'))
  if (!auth) {
    throw createError({ statusCode: 401, message: 'No autenticado' })
  }
  event.context.auth = auth

  const pathname = path.split('?')[0]
  const needed = requiredRoleFor(pathname, event.method)
  if (!roleAtLeast(auth.role, needed)) {
    throw createError({ statusCode: 403, statusMessage: 'No tienes permisos para esta acción' })
  }
})
