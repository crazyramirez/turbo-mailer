import { resolveSession, multiUserEnabled } from '~/server/utils/users'

export default defineEventHandler((event) => {
  const auth = resolveSession(getCookie(event, 'tm_session'))
  if (!auth) {
    throw createError({ statusCode: 401, message: 'No autenticado' })
  }
  return { authenticated: true, user: auth, multiUser: multiUserEnabled() }
})
