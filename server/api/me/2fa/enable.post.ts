import { sqlite } from '~/server/db/index'
import { getClientIp, createRefreshToken } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { authOf, getUser, totpSecretOf, generateRecoveryCodes, revokeUserSessions } from '~/server/utils/users'
import { verifyTotp } from '~/server/utils/totp'

// Step 2: confirm a code from the app → 2FA on + one-time recovery codes
// (shown once, stored hashed). Other sessions are signed out.
export default defineEventHandler(async (event) => {
  const auth = authOf(event)
  if (auth.userId === null) throw createError({ statusCode: 409, statusMessage: 'La verificación en dos pasos requiere cuentas de equipo' })
  const user = getUser(auth.userId)!
  if (user.totp_enabled) throw createError({ statusCode: 409, statusMessage: 'La verificación en dos pasos ya está activa' })
  const secret = totpSecretOf(user)
  if (!secret) throw createError({ statusCode: 409, statusMessage: 'Primero genera el código QR' })

  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const step = verifyTotp(secret, String(body.code ?? ''))
  if (step === null) throw createError({ statusCode: 400, statusMessage: 'Código incorrecto. Comprueba la hora de tu móvil e inténtalo de nuevo.' })

  const { codes, hashes } = generateRecoveryCodes()
  sqlite.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ?, recovery_codes = ? WHERE id = ?')
    .run(step, JSON.stringify(hashes), user.id)
  revokeUserSessions(user.id, getCookie(event, 'tm_session'))
  logAudit('auth.2fa_enabled', { userId: user.id }, getClientIp(event))
  return { ok: true, recoveryCodes: codes, refreshToken: await createRefreshToken(getClientIp(event), user.id) }
})
