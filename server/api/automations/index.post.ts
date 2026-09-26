import { sqlite } from '~/server/db/index'
import { validateTrigger } from '~/server/utils/automation-api'
import { validateSteps, syncCarrierCampaigns } from '~/server/utils/automation-engine'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Creates an automation as a draft (optionally from a template payload).
export default defineEventHandler(async (event) => {
  const b = await readBody<Record<string, any>>(event)
  const name = String(b?.name || '').trim().slice(0, 120) || 'Nueva automatización'
  const trigger = validateTrigger(b?.trigger ?? { type: 'subscribed' })
  let steps
  try { steps = validateSteps(b?.steps ?? []) } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }
  // Same sanitizer as campaign templates and the update endpoint
  const sanitize = (list: any[]): void => list.forEach((s) => {
    if (s.templateHtml) s.templateHtml = sanitizeEmailHtml(s.templateHtml)
    if (s.yes) sanitize(s.yes)
    if (s.no) sanitize(s.no)
  })
  sanitize(steps)
  const now = Math.floor(Date.now() / 1000)
  const id = Number(sqlite.prepare(
    `INSERT INTO automations (name, status, "trigger", steps, allow_reentry, created_at, updated_at) VALUES (?, 'draft', ?, '[]', ?, ?, ?)`,
  ).run(name, JSON.stringify(trigger), b?.allowReentry ? 1 : 0, now, now).lastInsertRowid)
  syncCarrierCampaigns(id, name, steps)
  sqlite.prepare('UPDATE automations SET steps = ? WHERE id = ?').run(JSON.stringify(steps), id)
  logAudit('automation.create', { id, name }, getClientIp(event))
  return { id }
})
