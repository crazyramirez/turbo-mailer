import { createSession, validateAndRotateRefreshToken, getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const { refreshToken } = body ?? {}

  if (!refreshToken || typeof refreshToken !== 'string') {
    throw createError({ statusCode: 401, message: 'Refresh token requerido' })
  }

  const ip = getClientIp(event)
  const newRefreshToken = await validateAndRotateRefreshToken(refreshToken, ip)

  if (!newRefreshToken) {
    throw createError({ statusCode: 401, message: 'Refresh token inválido o expirado' })
  }

  const sessionToken = await createSession(ip)

  setCookie(event, 'tm_session', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60,
    path: '/',
    secure: process.env.NODE_ENV === 'production'
  })

  return { success: true, refreshToken: newRefreshToken }
})
