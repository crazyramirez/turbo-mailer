import { checkRateLimit, recordFailedAttempt, clearAttempts, createSession, createRefreshToken, getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { multiUserEnabled, getUserByEmail, checkPassword, checkLegacyPassword, verifySecondFactor } from '~/server/utils/users'
import { sqlite } from '~/server/db/index'

function failed(ip: string, detail: Record<string, unknown>, message: string, extra: Record<string, unknown> = {}): never {
  const result = recordFailedAttempt(ip)
  if (result.blocked) {
    logAudit('login.blocked', { ip, ...detail }, ip)
    throw createError({
      statusCode: 429,
      message: `IP bloqueada 15 min tras ${10} intentos fallidos.`,
      data: { remaining: 0, blocked: true },
    })
  }
  logAudit('login.failed', { ip, remaining: result.remaining, ...detail }, ip)
  throw createError({
    statusCode: 401,
    message: `${message} ${result.remaining} intentos restantes.`,
    data: { remaining: result.remaining, blocked: false, ...extra },
  })
}

export default defineEventHandler(async (event) => {
  const ip = getClientIp(event)

  const limit = checkRateLimit(ip)
  if (limit.blocked) {
    const mins = Math.ceil(limit.retryAfterSec! / 60)
    throw createError({ statusCode: 429, message: `IP bloqueada. Espera ${mins} min.`, data: { retryAfterSec: limit.retryAfterSec } })
  }

  const body = await readBody(event).catch(() => ({}))
  const { password, email, code } = body ?? {}

  if (!password || typeof password !== 'string') {
    throw createError({ statusCode: 400, message: 'Contraseña requerida' })
  }

  let userId: number | null = null

  if (multiUserEnabled()) {
    // Team mode: email + password (+ second factor when enabled)
    if (!email || typeof email !== 'string') {
      throw createError({ statusCode: 400, message: 'Email requerido', data: { emailRequired: true } })
    }
    const user = getUserByEmail(email)
    const passwordOk = checkPassword(password, user?.password_hash)
    if (!user || !passwordOk || user.disabled) {
      failed(ip, { email: String(email).slice(0, 254) }, 'Email o contraseña incorrectos.')
    }
    if (user.totp_enabled) {
      if (!code) {
        // Correct password: ask for the second factor without burning an attempt
        throw createError({ statusCode: 401, message: 'Introduce el código de verificación', data: { totpRequired: true } })
      }
      if (!verifySecondFactor(user, String(code))) {
        failed(ip, { email: user.email, reason: 'totp' }, 'Código de verificación incorrecto.', { totpRequired: true })
      }
    }
    userId = user.id
    sqlite.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), user.id)
  } else {
    const config = useServerConfig()
    const correctPassword = config.appPassword
    if (!correctPassword) {
      throw createError({ statusCode: 500, message: 'APP_PASSWORD no configurado' })
    }
    if (!checkLegacyPassword(password, correctPassword)) {
      failed(ip, {}, 'Contraseña incorrecta.')
    }
  }

  clearAttempts(ip)
  logAudit('login.success', { ip, userId }, ip)
  const [token, refreshToken] = await Promise.all([createSession(ip, userId), createRefreshToken(ip, userId)])

  setCookie(event, 'tm_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
    secure: process.env.NODE_ENV === 'production'
  })

  return { success: true, refreshToken }
})
