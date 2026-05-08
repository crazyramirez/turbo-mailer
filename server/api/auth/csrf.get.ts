import { generateCsrfToken } from '~/server/utils/csrf'

export default defineEventHandler(async (event) => {
  const sessionToken = getCookie(event, 'tm_session')
  if (!sessionToken) {
    throw createError({ statusCode: 401, message: 'Not authenticated' })
  }
  const config = useServerConfig()
  const secret = String(config.unsubscribeSecret || '')
  if (!secret) throw createError({ statusCode: 500, message: 'Server misconfigured' })

  const token = generateCsrfToken(sessionToken, secret)
  return { token }
})
