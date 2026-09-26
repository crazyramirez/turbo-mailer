import { sqlite } from '~/server/db/index'
import { getClientIp, createRefreshToken } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { writeServerConfig } from '~/server/utils/serverConfig'
import {
  authOf, getUser, publicUser, checkPassword, checkLegacyPassword,
  validatePassword, hashPassword, revokeUserSessions,
} from '~/server/utils/users'

// Own profile: display name and password. In single-password mode this
// changes the install's access password.
export default defineEventHandler(async (event) => {
  const auth = authOf(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const ip = getClientIp(event)
  const token = getCookie(event, 'tm_session')
  let refreshToken: string | undefined

  if (body.newPassword !== undefined) {
    const pwError = validatePassword(body.newPassword)
    if (pwError) throw createError({ statusCode: 400, statusMessage: pwError })
    const current = String(body.currentPassword ?? '')

    if (auth.userId === null) {
      if (!checkLegacyPassword(current, useServerConfig().appPassword)) {
        throw createError({ statusCode: 400, statusMessage: 'La contraseña actual no es correcta' })
      }
      writeServerConfig({ appPassword: hashPassword(body.newPassword) })
      // Everyone else logged in with the old password is signed out
      sqlite.prepare('DELETE FROM sessions WHERE user_id IS NULL AND token != ?').run(token ?? '')
      sqlite.prepare('DELETE FROM refresh_tokens WHERE user_id IS NULL').run()
      logAudit('auth.password_changed', {}, ip)
      // This device keeps working: fresh refresh token to replace the revoked one
      return { ok: true, user: null, refreshToken: await createRefreshToken(ip, null) }
    }

    const user = getUser(auth.userId)!
    if (!checkPassword(current, user.password_hash)) {
      throw createError({ statusCode: 400, statusMessage: 'La contraseña actual no es correcta' })
    }
    sqlite.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.newPassword), user.id)
    revokeUserSessions(user.id, token)
    logAudit('auth.password_changed', { userId: user.id }, ip)
    refreshToken = await createRefreshToken(ip, user.id)
  }

  if (body.name !== undefined && auth.userId !== null) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null
    sqlite.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, auth.userId)
  }

  const user = auth.userId !== null ? getUser(auth.userId) : undefined
  return { ok: true, user: user ? publicUser(user) : null, refreshToken }
})
