import { sqlite } from '~/server/db/index'
import { getClientIp, createRefreshToken } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import {
  authOf, isRole, validatePassword, hashPassword, getUser, publicUser,
  roleAtLeast, countOwners, revokeUserSessions,
} from '~/server/utils/users'

export default defineEventHandler(async (event) => {
  const auth = authOf(event)
  const id = Number(getRouterParam(event, 'id'))
  const target = Number.isInteger(id) ? getUser(id) : undefined
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado' })
  const isSelf = target.id === auth.userId
  if (target.role === 'owner' && !roleAtLeast(auth.role, 'owner') && !isSelf) {
    throw createError({ statusCode: 403, statusMessage: 'Solo un propietario puede modificar a otro propietario' })
  }

  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const sets: string[] = []
  const args: unknown[] = []
  const changes: Record<string, unknown> = {}
  let revoke = false

  if (body.name !== undefined) {
    sets.push('name = ?')
    args.push(typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null)
  }
  if (body.role !== undefined && body.role !== target.role) {
    if (!isRole(body.role)) throw createError({ statusCode: 400, statusMessage: 'Rol no válido' })
    if (isSelf) throw createError({ statusCode: 409, statusMessage: 'No puedes cambiar tu propio rol' })
    if (body.role === 'owner' && !roleAtLeast(auth.role, 'owner')) {
      throw createError({ statusCode: 403, statusMessage: 'Solo un propietario puede nombrar propietarios' })
    }
    if (target.role === 'owner' && countOwners(target.id) === 0) {
      throw createError({ statusCode: 409, statusMessage: 'Debe quedar al menos un propietario activo' })
    }
    sets.push('role = ?')
    args.push(body.role)
    changes.role = body.role
  }
  if (body.disabled !== undefined && !!body.disabled !== !!target.disabled) {
    if (isSelf) throw createError({ statusCode: 409, statusMessage: 'No puedes desactivar tu propia cuenta' })
    if (body.disabled && target.role === 'owner' && countOwners(target.id) === 0) {
      throw createError({ statusCode: 409, statusMessage: 'Debe quedar al menos un propietario activo' })
    }
    sets.push('disabled = ?')
    args.push(body.disabled ? 1 : 0)
    changes.disabled = !!body.disabled
    revoke ||= !!body.disabled
  }
  if (body.password) {
    const pwError = validatePassword(body.password)
    if (pwError) throw createError({ statusCode: 400, statusMessage: pwError })
    sets.push('password_hash = ?')
    args.push(hashPassword(body.password))
    changes.passwordReset = true
    revoke = true
  }
  if (body.resetTotp) {
    sets.push('totp_secret = NULL', 'totp_enabled = 0', 'totp_last_step = NULL', 'recovery_codes = NULL')
    changes.totpReset = true
  }
  if (!sets.length) return publicUser(target)

  sqlite.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...args, target.id)
  if (revoke) revokeUserSessions(target.id, isSelf ? getCookie(event, 'tm_session') : undefined)
  logAudit('users.updated', { id: target.id, email: target.email, ...changes }, getClientIp(event))
  const refreshToken = revoke && isSelf ? await createRefreshToken(getClientIp(event), target.id) : undefined
  return { ...publicUser(getUser(target.id)!), refreshToken }
})
