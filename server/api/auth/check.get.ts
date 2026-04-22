import { validateSession } from '~/server/utils/auth'

export default defineEventHandler((event) => {
  const token = getCookie(event, 'tm_session')
  if (!token || !validateSession(token)) {
    throw createError({ statusCode: 401, message: 'No autenticado' })
  }
  return { authenticated: true }
})
