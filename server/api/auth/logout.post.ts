import { destroySession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'tm_session')
  if (token) await destroySession(token)

  deleteCookie(event, 'tm_session', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/'
  })

  return { success: true }
})
