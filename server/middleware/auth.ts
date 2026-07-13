import { validateSession } from '~/server/utils/auth'

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
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
]

export default defineEventHandler(async (event) => {
  const path = event.path ?? getRequestURL(event).pathname

  if (!path.startsWith('/api/')) return

  if (PUBLIC_PATHS.some(p => path.startsWith(p))) return

  const token = getCookie(event, 'tm_session')
  if (!token || !(await validateSession(token))) {
    throw createError({ statusCode: 401, message: 'No autenticado' })
  }
})
