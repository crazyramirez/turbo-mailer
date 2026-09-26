import { sqlite } from '~/server/db/index'
import { getClientIp } from '~/server/utils/auth'
import { logAudit } from '~/server/utils/audit'
import { authOf, getUser, roleAtLeast, countOwners, revokeUserSessions } from '~/server/utils/users'

export default defineEventHandler((event) => {
  const auth = authOf(event)
  const id = Number(getRouterParam(event, 'id'))
  const target = Number.isInteger(id) ? getUser(id) : undefined
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado' })
  if (target.id === auth.userId) throw createError({ statusCode: 409, statusMessage: 'No puedes eliminar tu propia cuenta' })
  if (target.role === 'owner') {
    if (!roleAtLeast(auth.role, 'owner')) throw createError({ statusCode: 403, statusMessage: 'Solo un propietario puede eliminar a otro propietario' })
    if (countOwners(target.id) === 0) throw createError({ statusCode: 409, statusMessage: 'Debe quedar al menos un propietario activo' })
  }
  revokeUserSessions(target.id)
  sqlite.prepare('DELETE FROM users WHERE id = ?').run(target.id)
  logAudit('users.deleted', { id: target.id, email: target.email }, getClientIp(event))
  return { ok: true }
})
