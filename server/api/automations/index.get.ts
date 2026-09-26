import { sqlite } from '~/server/db/index'
import { runCounts } from '~/server/utils/automation-api'

export default defineEventHandler(() => {
  const rows = sqlite.prepare(`SELECT id, name, status, "trigger" AS trig, steps, allow_reentry AS allowReentry, updated_at AS updatedAt FROM automations ORDER BY id DESC`).all() as any[]
  return rows.map(r => {
    let trigger = null
    let stepsCount = 0
    try { trigger = JSON.parse(r.trig) } catch {}
    try {
      const count = (l: any[]): number => l.reduce((a, s) => a + 1 + (s.yes ? count(s.yes) : 0) + (s.no ? count(s.no) : 0), 0)
      stepsCount = count(JSON.parse(r.steps || '[]'))
    } catch {}
    return {
      id: r.id, name: r.name, status: r.status, trigger, stepsCount, allowReentry: !!r.allowReentry,
      updatedAt: r.updatedAt ? new Date(r.updatedAt * 1000).toISOString() : null,
      runs: runCounts(r.id),
    }
  })
})
