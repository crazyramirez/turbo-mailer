import { sqlite } from '~/server/db/index'
import { createRefreshToken, getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { authOf, multiUserEnabled, validateEmail, validatePassword, hashPassword, getUser, publicUser } from '~/server/utils/users'

// Switches a single-password install to team accounts: creates the first
// owner, moves the caller's session onto it and retires every other legacy
// session and refresh token (they'd otherwise keep owner access forever).
export default defineEventHandler(async (event) => {
  if (multiUserEnabled()) throw createError({ statusCode: 409, statusMessage: 'Las cuentas de equipo ya están activadas' })
  const auth = authOf(event)
  if (auth.userId !== null) throw createError({ statusCode: 403, statusMessage: 'No permitido' })

  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const email = validateEmail(body.email)
  if (!email) throw createError({ statusCode: 400, statusMessage: 'Email no válido' })
  const pwError = validatePassword(body.password)
  if (pwError) throw createError({ statusCode: 400, statusMessage: pwError })
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null

  const token = getCookie(event, 'tm_session') ?? ''
  const now = Math.floor(Date.now() / 1000)
  const id = sqlite.transaction(() => {
    const res = sqlite.prepare(`INSERT INTO users (email, name, password_hash, role, totp_enabled, disabled, created_at)
      VALUES (?, ?, ?, 'owner', 0, 0, ?)`).run(email, name, hashPassword(body.password), now)
    const userId = Number(res.lastInsertRowid)
    sqlite.prepare('UPDATE sessions SET user_id = ? WHERE token = ?').run(userId, token)
    sqlite.prepare('DELETE FROM sessions WHERE user_id IS NULL').run()
    sqlite.prepare('DELETE FROM refresh_tokens WHERE user_id IS NULL').run()
    return userId
  })()

  event.context.auth = { userId: id, email, name, role: 'owner' }
  logAudit('users.activated', { email }, getClientIp(event))
  const refreshToken = await createRefreshToken(getClientIp(event), id)
  return { user: publicUser(getUser(id)!), refreshToken }
})
