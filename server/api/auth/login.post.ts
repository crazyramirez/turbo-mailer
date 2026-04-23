import { checkRateLimit, recordFailedAttempt, clearAttempts, createSession, getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const ip = getClientIp(event)

  const limit = checkRateLimit(ip)
  if (limit.blocked) {
    const mins = Math.ceil(limit.retryAfterSec! / 60)
    throw createError({ statusCode: 429, message: `IP bloqueada. Espera ${mins} min.` })
  }

  const body = await readBody(event).catch(() => ({}))
  const { password } = body ?? {}

  if (!password || typeof password !== 'string') {
    throw createError({ statusCode: 400, message: 'Contraseña requerida' })
  }

  const config = useRuntimeConfig()
  const correctPassword = config.appPassword
  if (!correctPassword) {
    throw createError({ statusCode: 500, message: 'APP_PASSWORD no configurado' })
  }

  if (password !== correctPassword) {
    const result = recordFailedAttempt(ip)
    if (result.blocked) {
      throw createError({
        statusCode: 429,
        message: `IP bloqueada 15 min tras ${10} intentos fallidos.`,
        data: { remaining: 0, blocked: true }
      })
    }
    throw createError({
      statusCode: 401,
      message: `Contraseña incorrecta. ${result.remaining} intentos restantes.`,
      data: { remaining: result.remaining, blocked: false }
    })
  }

  clearAttempts(ip)
  const token = createSession(ip)

  setCookie(event, 'tm_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60,
    path: '/',
    secure: process.env.NODE_ENV === 'production'
  })

  return { success: true }
})
