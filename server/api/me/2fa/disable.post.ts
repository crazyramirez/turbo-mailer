import { sqlite } from '~/server/db/index'
import { getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { authOf, getUser, checkPassword, verifySecondFactor } from '~/server/utils/users'

export default defineEventHandler(async (event) => {
  const auth = authOf(event)
  if (auth.userId === null) throw createError({ statusCode: 409, statusMessage: 'La verificación en dos pasos requiere cuentas de equipo' })
  const user = getUser(auth.userId)!
  if (!user.totp_enabled) return { ok: true }

  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!checkPassword(String(body.password ?? ''), user.password_hash)) {
    throw createError({ statusCode: 400, statusMessage: 'La contraseña no es correcta' })
  }
  if (!verifySecondFactor(user, String(body.code ?? ''))) {
    throw createError({ statusCode: 400, statusMessage: 'Código incorrecto' })
  }
  sqlite.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL, recovery_codes = NULL WHERE id = ?').run(user.id)
  logAudit('auth.2fa_disabled', { userId: user.id }, getClientIp(event))
  return { ok: true }
})
