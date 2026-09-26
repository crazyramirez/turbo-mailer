import { sqlite } from '~/server/db/index'
import { runCounts, stepStats } from '~/server/utils/automation-api'
import type { AutoStep } from '~/server/utils/automation-engine'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const r = sqlite.prepare(`SELECT id, name, status, "trigger" AS trig, steps, allow_reentry AS allowReentry FROM automations WHERE id = ?`).get(id) as any
  if (!r) throw createError({ statusCode: 404, statusMessage: 'Automation not found' })
  const steps = JSON.parse(r.steps || '[]') as AutoStep[]
  // Attach each email step's content from its carrier campaign for editing
  const hydrate = (list: AutoStep[]) => {
    for (const s of list) {
      if (s.type === 'email' && s.campaignId) {
        const c = sqlite.prepare('SELECT subject, preheader, template_html AS html, template_name AS templateName FROM campaigns WHERE id = ?').get(s.campaignId) as any
        if (c) Object.assign(s, { subject: c.subject, preheader: c.preheader ?? '', templateHtml: c.html ?? '', templateName: c.templateName ?? '' })
      }
      if (s.yes) hydrate(s.yes)
      if (s.no) hydrate(s.no)
    }
  }
  hydrate(steps)
  const recent = sqlite.prepare(
    `SELECT r.id, r.status, r.cursor, r.next_run_at AS nextRunAt, r.started_at AS startedAt, r.last_error AS lastError, c.email
     FROM automation_runs r LEFT JOIN contacts c ON c.id = r.contact_id WHERE r.automation_id = ? ORDER BY r.id DESC LIMIT 50`,
  ).all(id) as any[]
  return {
    id: r.id, name: r.name, status: r.status, trigger: JSON.parse(r.trig), steps, allowReentry: !!r.allowReentry,
    runs: runCounts(id),
    stats: stepStats(steps),
    recentRuns: recent.map(x => ({
      ...x,
      nextRunAt: x.nextRunAt ? new Date(x.nextRunAt * 1000).toISOString() : null,
      startedAt: x.startedAt ? new Date(x.startedAt * 1000).toISOString() : null,
    })),
  }
})
