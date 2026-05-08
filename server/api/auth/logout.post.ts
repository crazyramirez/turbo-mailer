import { destroySession, destroyRefreshToken } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'tm_session')
  if (token) await destroySession(token)

  const body = await readBody(event).catch(() => ({}))
  const { refreshToken } = body ?? {}
  if (refreshToken && typeof refreshToken === 'string') {
    await destroyRefreshToken(refreshToken)
  }

  deleteCookie(event, 'tm_session', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/'
  })

  return { success: true }
})
