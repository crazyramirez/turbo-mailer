import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { backupDir } from '~/server/utils/backup'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

export default defineEventHandler((event) => {
  const name = path.basename(String(getQuery(event).name || ''))
  if (!/^backup_[\w-]+\.zip$/.test(name)) throw createError({ statusCode: 400, statusMessage: 'Nombre no válido' })
  const file = path.join(backupDir, name)
  if (!existsSync(file)) throw createError({ statusCode: 404, statusMessage: 'No encontrado' })
  logAudit('backup.download', { name }, getClientIp(event))
  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Length', statSync(file).size)
  setHeader(event, 'Content-Disposition', `attachment; filename="${name}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return sendStream(event, createReadStream(file))
})
