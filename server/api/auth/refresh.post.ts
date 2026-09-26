import { createSession, validateAndRotateRefreshToken, getClientIp } from '~/server/utils/auth'
import { multiUserEnabled, getUser } from '~/server/utils/users'
import { sqlite } from '~/server/db/index'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const { refreshToken } = body ?? {}

  if (!refreshToken || typeof refreshToken !== 'string') {
    throw createError({ statusCode: 401, message: 'Refresh token requerido' })
  }

  const ip = getClientIp(event)
  const rotated = await validateAndRotateRefreshToken(refreshToken, ip)

  if (!rotated) {
    throw createError({ statusCode: 401, message: 'Refresh token inválido o expirado' })
  }

  // The user behind the token must still be allowed in; legacy tokens die
  // once team accounts are enabled
  const user = rotated.userId !== null ? getUser(rotated.userId) : null
  if ((rotated.userId === null && multiUserEnabled()) || (rotated.userId !== null && (!user || user.disabled))) {
    sqlite.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(rotated.token)
    throw createError({ statusCode: 401, message: 'Refresh token inválido o expirado' })
  }

  const sessionToken = await createSession(ip, rotated.userId)

  setCookie(event, 'tm_session', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
    secure: process.env.NODE_ENV === 'production'
  })

  return { success: true, refreshToken: rotated.token }
})
