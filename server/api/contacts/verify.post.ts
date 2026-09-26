import { startVerifyJob } from '~/server/utils/verify-job'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ listId?: number; onlyUnverified?: boolean; suppressInvalid?: boolean }>(event).catch(() => ({} as any))
  const job = startVerifyJob({
    listId: body?.listId ? Number(body.listId) : null,
    onlyUnverified: body?.onlyUnverified !== false,
    suppressInvalid: body?.suppressInvalid === true,
  })
  logAudit('contacts.verify', { listId: body?.listId ?? null, total: job.total }, getClientIp(event))
  return job
})
