import { sqlite } from '~/server/db/index'
import { getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { authOf, getUser, checkPassword, verifySecondFactor, generateRecoveryCodes } from '~/server/utils/users'

// New set of recovery codes (the old ones stop working).
export default defineEventHandler(async (event) => {
  const auth = authOf(event)
  if (auth.userId === null) throw createError({ statusCode: 409, statusMessage: 'La verificación en dos pasos requiere cuentas de equipo' })
  const user = getUser(auth.userId)!
  if (!user.totp_enabled) throw createError({ statusCode: 409, statusMessage: 'La verificación en dos pasos no está activa' })

  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!checkPassword(String(body.password ?? ''), user.password_hash)) {
    throw createError({ statusCode: 400, statusMessage: 'La contraseña no es correcta' })
  }
  if (!verifySecondFactor(user, String(body.code ?? ''))) {
    throw createError({ statusCode: 400, statusMessage: 'Código incorrecto' })
  }
  const { codes, hashes } = generateRecoveryCodes()
  sqlite.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(hashes), user.id)
  logAudit('auth.recovery_regenerated', { userId: user.id }, getClientIp(event))
  return { recoveryCodes: codes }
})
