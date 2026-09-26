import { sqlite } from '~/server/db/index'
import type { AutomationTrigger } from '~/server/utils/contact-events'
import type { AutoStep } from '~/server/utils/automation-engine'

const TRIGGERS = ['subscribed', 'list_added', 'tag_added', 'form_submitted', 'email_opened', 'link_clicked', 'api_event', 'date', 'manual']

export function validateTrigger(raw: any): AutomationTrigger {
  const type = String(raw?.type)
  if (!TRIGGERS.includes(type)) throw createError({ statusCode: 400, statusMessage: 'Disparador no válido' })
  const t: AutomationTrigger = { type: type as AutomationTrigger['type'] }
  if (type === 'subscribed' || type === 'list_added') {
    t.listId = raw?.listId ? Number(raw.listId) : null
    if (type === 'list_added' && !t.listId) throw createError({ statusCode: 400, statusMessage: 'Elige la lista del disparador' })
  }
  if (type === 'tag_added') {
    t.tag = String(raw?.tag || '').trim().slice(0, 50)
    if (!t.tag) throw createError({ statusCode: 400, statusMessage: 'Indica la etiqueta del disparador' })
  }
  if (type === 'form_submitted') t.formId = raw?.formId ? Number(raw.formId) : null
  if (type === 'email_opened' || type === 'link_clicked') t.campaignId = raw?.campaignId ? Number(raw.campaignId) : null
  if (type === 'link_clicked') t.urlContains = String(raw?.urlContains || '').slice(0, 200) || undefined
  if (type === 'api_event') {
    t.event = String(raw?.event || '').trim().slice(0, 60)
    if (!/^[\w.:-]+$/.test(t.event)) throw createError({ statusCode: 400, statusMessage: 'Nombre de evento no válido' })
  }
  if (type === 'date') {
    t.field = String(raw?.field || '')
    if (t.field !== 'created_at' && !/^[a-z][a-z0-9_]{0,39}$/.test(t.field)) throw createError({ statusCode: 400, statusMessage: 'Campo de fecha no válido' })
    t.offsetDays = Math.max(-60, Math.min(60, Number(raw?.offsetDays) || 0))
  }
  return t
}

/** Per email step: delivery/engagement of its carrier campaign. */
export function stepStats(steps: AutoStep[]) {
  const out: Record<string, { sent: number; opens: number; clicks: number; skipped: number }> = {}
  const visit = (list: AutoStep[]) => {
    for (const s of list) {
      if (s.type === 'email' && s.campaignId) {
        const r = sqlite.prepare(
          `SELECT COUNT(*) FILTER (WHERE status IN ('sent', 'opened')) AS sent,
                  COUNT(*) FILTER (WHERE status = 'opened' AND COALESCE(opened_by_proxy, 0) = 0) AS opens,
                  COUNT(*) FILTER (WHERE status = 'skipped') AS skipped
           FROM sends WHERE campaign_id = ?`,
        ).get(s.campaignId) as { sent: number; opens: number; skipped: number }
        const clicks = (sqlite.prepare(`SELECT COUNT(DISTINCT send_id) AS n FROM tracking_events WHERE campaign_id = ? AND event_type = 'click'`).get(s.campaignId) as { n: number }).n
        out[s.id] = { ...r, clicks }
      }
      if (s.yes) visit(s.yes)
      if (s.no) visit(s.no)
    }
  }
  visit(steps)
  return out
}

export function runCounts(automationId: number) {
  const rows = sqlite.prepare('SELECT status, COUNT(*) AS n FROM automation_runs WHERE automation_id = ? GROUP BY status').all(automationId) as { status: string; n: number }[]
  const c: Record<string, number> = { active: 0, waiting: 0, done: 0, exited: 0, failed: 0 }
  rows.forEach(r => { c[r.status] = r.n })
  return { ...c, total: rows.reduce((a, r) => a + r.n, 0) }
}
