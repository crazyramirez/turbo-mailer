import { sqlite } from '~/server/db/index'
import { validateTrigger } from '~/server/utils/automation-api'
import { validateSteps, syncCarrierCampaigns } from '~/server/utils/automation-engine'
import { invalidateAutomationCache } from '~/server/utils/contact-events'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const cur = sqlite.prepare('SELECT id, status FROM automations WHERE id = ?').get(id) as { id: number; status: string } | undefined
  if (!cur) throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
  const b = await readBody<Record<string, any>>(event)
  const name = String(b?.name || '').trim().slice(0, 120) || 'Automatización'
  const trigger = validateTrigger(b?.trigger)
  let steps
  try {
    steps = validateSteps(b?.steps ?? [])
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  // Email HTML goes through the same sanitizer as campaign templates
  const sanitize = (list: any[]) => list.forEach((s) => {
    if (s.templateHtml) s.templateHtml = sanitizeEmailHtml(s.templateHtml)
    if (s.yes) sanitize(s.yes)
    if (s.no) sanitize(s.no)
  })
  sanitize(steps)

  const status = ['draft', 'active', 'paused'].includes(b?.status) ? b.status : cur.status
  if (status === 'active') {
    const hasAction = JSON.stringify(steps).includes('"type":"email"') || JSON.stringify(steps).match(/"type":"(tag|list|field|webhook)"/)
    if (!hasAction) throw createError({ statusCode: 400, statusMessage: 'Añade al menos un paso con acción antes de activar' })
    const missingTpl = (list: any[]): boolean => list.some(s => (s.type === 'email' && !s.templateHtml && !s.campaignId) || (s.yes && missingTpl(s.yes)) || (s.no && missingTpl(s.no)))
    if (missingTpl(steps)) throw createError({ statusCode: 400, statusMessage: 'Todos los emails necesitan una plantilla' })
  }

  syncCarrierCampaigns(id, name, steps)
  sqlite.prepare(`UPDATE automations SET name = ?, "trigger" = ?, steps = ?, status = ?, allow_reentry = ?, updated_at = ? WHERE id = ?`)
    .run(name, JSON.stringify(trigger), JSON.stringify(steps), status, b?.allowReentry ? 1 : 0, Math.floor(Date.now() / 1000), id)
  invalidateAutomationCache()
  if (status !== cur.status) logAudit('automation.status', { id, from: cur.status, to: status }, getClientIp(event))
  return { ok: true, status }
})
