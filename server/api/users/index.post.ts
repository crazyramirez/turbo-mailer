import { sqlite } from '~/server/db/index'
import { getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import {
  authOf, isRole, multiUserEnabled, validateEmail, validatePassword, hashPassword,
  getUser, getUserByEmail, publicUser, roleAtLeast,
} from '~/server/utils/users'

export default defineEventHandler(async (event) => {
  if (!multiUserEnabled()) throw createError({ statusCode: 409, statusMessage: 'Activa primero las cuentas de equipo' })
  const auth = authOf(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}

  const email = validateEmail(body.email)
  if (!email) throw createError({ statusCode: 400, statusMessage: 'Email no válido' })
  if (!isRole(body.role)) throw createError({ statusCode: 400, statusMessage: 'Rol no válido' })
  if (body.role === 'owner' && !roleAtLeast(auth.role, 'owner')) {
    throw createError({ statusCode: 403, statusMessage: 'Solo un propietario puede crear otro propietario' })
  }
  const pwError = validatePassword(body.password)
  if (pwError) throw createError({ statusCode: 400, statusMessage: pwError })
  if (getUserByEmail(email)) throw createError({ statusCode: 409, statusMessage: 'Ya existe un usuario con ese email' })
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null

  const res = sqlite.prepare(`INSERT INTO users (email, name, password_hash, role, totp_enabled, disabled, created_at)
    VALUES (?, ?, ?, ?, 0, 0, ?)`).run(email, name, hashPassword(body.password), body.role, Math.floor(Date.now() / 1000))
  const id = Number(res.lastInsertRowid)
  logAudit('users.created', { id, email, role: body.role }, getClientIp(event))
  return publicUser(getUser(id)!)
})
