import { sqlite } from '~/server/db/index'
import { writeServerConfig, readFileConfig } from '~/server/utils/serverConfig'
import { closeAllTransports } from '~/server/utils/mailer'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const id = String(getQuery(event).id || '')
  if (!id || id === 'default') throw createError({ statusCode: 400, statusMessage: 'El perfil principal no se puede eliminar' })
  const inUse = sqlite.prepare(`SELECT COUNT(*) AS n FROM campaigns WHERE sender_profile_id = ? AND status IN ('draft', 'scheduled', 'sending', 'paused')`).get(id) as { n: number }
  if (inUse.n) throw createError({ statusCode: 409, statusMessage: `Lo usan ${inUse.n} campaña(s) sin terminar` })
  const list: any[] = Array.isArray(readFileConfig().smtpProfiles) ? readFileConfig().smtpProfiles : []
  writeServerConfig({ smtpProfiles: list.filter(p => p?.id !== id) })
  closeAllTransports()
  logAudit('settings.sender_deleted', { id }, getClientIp(event))
  return { ok: true }
})
