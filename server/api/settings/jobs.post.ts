import { runJobNow, jobsStatus } from '~/server/utils/jobs'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Manual trigger for a background job from Settings → System.
export default defineEventHandler(async (event) => {
  const { name } = (await readBody(event).catch(() => ({}))) ?? {}
  if (typeof name !== 'string' || !jobsStatus().some(j => j.name === name)) {
    throw createError({ statusCode: 404, statusMessage: 'Tarea desconocida' })
  }
  const ran = await runJobNow(name)
  if (!ran) throw createError({ statusCode: 409, statusMessage: 'La tarea ya se está ejecutando' })
  logAudit('jobs.run', { name }, getClientIp(event))
  return jobsStatus().find(j => j.name === name)
})
