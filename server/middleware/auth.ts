import { validateSession } from '~/server/utils/auth'

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/track/open',
  '/api/track/click',
  '/api/unsubscribe',
  '/api/subscribers',
  '/api/subscribe',
  '/api/ghost-status',
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
