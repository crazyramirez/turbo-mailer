import QRCode from 'qrcode'
import { authOf, getUser, checkPassword, storeTotpSecret } from '~/server/utils/users'
import { generateTotpSecret, otpauthUri } from '~/server/utils/totp'

// Step 1 of enabling 2FA: a fresh secret, stored but inactive until the
// user proves their app produces valid codes (enable.post).
export default defineEventHandler(async (event) => {
  const auth = authOf(event)
  if (auth.userId === null) throw createError({ statusCode: 409, statusMessage: 'La verificación en dos pasos requiere cuentas de equipo' })
  const user = getUser(auth.userId)!
  if (user.totp_enabled) throw createError({ statusCode: 409, statusMessage: 'La verificación en dos pasos ya está activa' })

  const body = (await readBody(event).catch(() => ({}))) ?? {}
  if (!checkPassword(String(body.password ?? ''), user.password_hash)) {
    throw createError({ statusCode: 400, statusMessage: 'La contraseña no es correcta' })
  }

  const secret = generateTotpSecret()
  storeTotpSecret(user.id, secret)
  const uri = otpauthUri(secret, user.email)
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  return { secret, uri, qrSvg }
})
