import { runScheduledBackup } from '~/server/utils/backup'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const res = await runScheduledBackup()
  logAudit('backup.manual', { local: path.basename(res.local), remote: res.remote }, getClientIp(event))
  return { local: path.basename(res.local), remote: res.remote }
})
