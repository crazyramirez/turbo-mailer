import { sqlite } from '~/server/db/index'
import { startCampaign } from '~/server/utils/send-engine'
import { contactMatches, type SegmentGroup } from '~/server/utils/segments'
import { enrollContact, invalidateAutomationCache, emitContactEvent, type AutomationTrigger } from '~/server/utils/contact-events'
import { assertPublicHttpUrl } from '~/server/utils/ssrf-guard'
import { sanitizeCustomValues } from '~/server/utils/custom-fields'

// Automation engine.
//
// An automation is a tree of steps; each contact walking it is a run with a
// cursor ("2.yes.0" = first step of the YES branch of step 2). Every minute
// (and right after an enrollment) due runs advance until they hit a wait or
// the end. Emails go through the regular send engine via a hidden carrier
// campaign per email step, so suppression, unsubscribes, DKIM, tracking and
// the circuit breaker apply exactly as for campaigns.

export interface AutoStep {
  id: string
  type: 'email' | 'wait' | 'wait_until' | 'condition' | 'tag' | 'list' | 'field' | 'webhook' | 'exit'
  campaignId?: number | null
  subject?: string
  preheader?: string
  templateHtml?: string
  templateName?: string
  amount?: number
  unit?: 'minutes' | 'hours' | 'days'
  weekdays?: number[]
  hour?: number
  condition?: { kind: 'segment'; rules: SegmentGroup } | { kind: 'opened_last' } | { kind: 'clicked_last' }
  yes?: AutoStep[]
  no?: AutoStep[]
  action?: 'add' | 'remove'
  tag?: string
  listId?: number
  key?: string
  value?: string
  url?: string
}

type Path = (number | 'yes' | 'no')[]

export function parsePath(cursor: string | null): Path {
  if (!cursor) return [0]
  return cursor.split('.').map(p => (p === 'yes' || p === 'no' ? p : Number(p)))
}
const fmtPath = (p: Path) => p.join('.')

export function stepAt(steps: AutoStep[], path: Path): AutoStep | null {
  let list: AutoStep[] | undefined = steps
  let step: AutoStep | null = null
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]
    if (typeof seg === 'number') {
      step = list?.[seg] ?? null
      if (!step) return null
    } else {
      list = step?.[seg]
    }
  }
  return step
}

/** Path of the step after `path`; climbs out of finished branches. null = done. */
export function nextPath(steps: AutoStep[], path: Path): Path | null {
  const p = [...path]
  for (;;) {
    const last = p[p.length - 1] as number
    const parentList: AutoStep[] | undefined = p.length === 1 ? steps : stepAt(steps, p.slice(0, -2))?.[p[p.length - 2] as 'yes' | 'no']
    if (parentList && last + 1 < parentList.length) {
      p[p.length - 1] = last + 1
      return p
    }
    if (p.length === 1) return null
    p.splice(-2, 2) // leave the branch: continue after the condition step
  }
}

function waitMs(step: AutoStep): number {
  const n = Math.max(0, Number(step.amount) || 0)
  const unit = step.unit === 'minutes' ? 60_000 : step.unit === 'hours' ? 3600_000 : 86400_000
  return n * unit
}

/** Next instant on an allowed weekday at `hour` (local time). */
export function nextSlot(from: Date, weekdays: number[] | undefined, hour: number | undefined): Date {
  const days = weekdays?.length ? weekdays : [0, 1, 2, 3, 4, 5, 6]
  const h = Math.min(23, Math.max(0, Number(hour ?? 9)))
  for (let add = 0; add < 8; add++) {
    const d = new Date(from)
    d.setDate(d.getDate() + add)
    d.setHours(h, 0, 0, 0)
    if (d.getTime() > from.getTime() && days.includes(d.getDay())) return d
  }
  return new Date(from.getTime() + 86400_000)
}

interface RunRow { id: number; automation_id: number; contact_id: number; status: string; cursor: string | null; context: string | null }

function contactRow(id: number) {
  return sqlite.prepare('SELECT id, email, status, tags, custom FROM contacts WHERE id = ?').get(id) as { id: number; email: string; status: string; tags: string | null; custom: string | null } | undefined
}

function enqueueEmail(campaignId: number, contact: { id: number; email: string }): number | null {
  const camp = sqlite.prepare('SELECT id, status, template_html AS html FROM campaigns WHERE id = ?').get(campaignId) as { id: number; status: string; html: string | null } | undefined
  if (!camp?.html) return null
  const now = Math.floor(Date.now() / 1000)
  const sendId = Number(sqlite.prepare(
    `INSERT INTO sends (campaign_id, contact_id, email, status, attempts, opened_by_proxy) VALUES (?, ?, ?, 'pending', 0, 0)`,
  ).run(campaignId, contact.id, contact.email).lastInsertRowid)
  sqlite.prepare(`UPDATE campaigns SET status = 'sending', started_at = COALESCE(started_at, ?), finished_at = NULL,
      total_recipients = COALESCE(total_recipients, 0) + 1 WHERE id = ?`).run(now, campaignId)
  startCampaign(campaignId)
  return sendId
}

async function fireWebhook(url: string, payload: Record<string, unknown>) {
  try {
    await assertPublicHttpUrl(url)
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'TurboMailer-Automation/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err: any) {
    console.warn('[automation] webhook failed:', err?.message)
  }
}

function applyTag(contactId: number, tag: string, action: 'add' | 'remove') {
  const c = contactRow(contactId)
  if (!c) return false
  let tags: string[] = []
  try { tags = JSON.parse(c.tags || '[]') } catch {}
  const has = tags.some(t => t.toLowerCase() === tag.toLowerCase())
  if (action === 'add' && !has) tags.push(tag)
  else if (action === 'remove' && has) tags = tags.filter(t => t.toLowerCase() !== tag.toLowerCase())
  else return false
  sqlite.prepare('UPDATE contacts SET tags = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(tags), Math.floor(Date.now() / 1000), contactId)
  return action === 'add'
}

let processing = false

/** Advances every due run. Returns how many runs moved. */
export async function processDueRuns(): Promise<number> {
  if (processing) return 0
  processing = true
  let moved = 0
  try {
    const now = Math.floor(Date.now() / 1000)
    const runs = sqlite.prepare(
      `SELECT r.id, r.automation_id, r.contact_id, r.status, r.cursor, r.context
       FROM automation_runs r JOIN automations a ON a.id = r.automation_id
       WHERE r.status IN ('active', 'waiting') AND COALESCE(r.next_run_at, 0) <= ? AND a.status = 'active'
       ORDER BY r.next_run_at LIMIT 500`,
    ).all(now) as RunRow[]

    const stepsCache = new Map<number, AutoStep[]>()
    for (const run of runs) {
      let steps = stepsCache.get(run.automation_id)
      if (!steps) {
        const a = sqlite.prepare('SELECT steps FROM automations WHERE id = ?').get(run.automation_id) as { steps: string }
        steps = JSON.parse(a.steps || '[]') as AutoStep[]
        stepsCache.set(run.automation_id, steps)
      }
      try {
        await advanceRun(run, steps)
        moved++
      } catch (err: any) {
        console.error(`[automation] run ${run.id} failed:`, err)
        sqlite.prepare(`UPDATE automation_runs SET status = 'failed', last_error = ?, finished_at = ? WHERE id = ?`)
          .run(String(err?.message || err).slice(0, 300), Math.floor(Date.now() / 1000), run.id)
      }
    }
  } finally {
    processing = false
  }
  return moved
}

async function advanceRun(run: RunRow, steps: AutoStep[]) {
  const context: Record<string, any> = (() => { try { return JSON.parse(run.context || '{}') } catch { return {} } })()
  let path: Path | null = parsePath(run.cursor)
  const finish = (status: 'done' | 'exited', reason?: string) => {
    sqlite.prepare(`UPDATE automation_runs SET status = ?, cursor = ?, next_run_at = NULL, finished_at = ?, context = ?, last_error = ? WHERE id = ?`)
      .run(status, path ? fmtPath(path) : null, Math.floor(Date.now() / 1000), JSON.stringify(context), reason ?? null, run.id)
  }

  const contact = contactRow(run.contact_id)
  if (!contact) return finish('exited', 'contact deleted')
  if (contact.status !== 'active') return finish('exited', `contact ${contact.status}`)

  // A waiting run resumes at the step AFTER the wait
  if (run.status === 'waiting') path = nextPath(steps, path)

  for (let guard = 0; guard < 60; guard++) {
    if (!path) return finish('done')
    const step = stepAt(steps, path)
    if (!step) return finish('done')

    switch (step.type) {
      case 'email': {
        if (step.campaignId) {
          const sendId = enqueueEmail(step.campaignId, contact)
          if (sendId) context.lastSendId = sendId
        }
        path = nextPath(steps, path)
        break
      }
      case 'wait':
      case 'wait_until': {
        const at = step.type === 'wait'
          ? new Date(Date.now() + waitMs(step))
          : nextSlot(new Date(), step.weekdays, step.hour)
        sqlite.prepare(`UPDATE automation_runs SET status = 'waiting', cursor = ?, next_run_at = ?, context = ? WHERE id = ?`)
          .run(fmtPath(path), Math.floor(at.getTime() / 1000), JSON.stringify(context), run.id)
        return
      }
      case 'condition': {
        let ok = false
        const cond = step.condition
        if (cond?.kind === 'segment') ok = contactMatches(cond.rules, contact.id)
        else if (cond?.kind === 'opened_last' || cond?.kind === 'clicked_last') {
          const sid = Number(context.lastSendId) || 0
          const q = cond.kind === 'clicked_last'
            ? `SELECT 1 FROM tracking_events WHERE send_id = ? AND event_type = 'click' LIMIT 1`
            : `SELECT 1 FROM tracking_events WHERE send_id = ? AND (event_type = 'click' OR (event_type = 'open' AND COALESCE(is_proxy, 0) = 0)) LIMIT 1`
          ok = sid ? !!sqlite.prepare(q).get(sid) : false
        }
        const branch = ok ? 'yes' : 'no'
        context.lastCondition = branch
        path = (step[branch]?.length ? [...path, branch, 0] : nextPath(steps, path)) as Path | null
        break
      }
      case 'tag':
        if (step.tag) {
          const added = applyTag(contact.id, step.tag.trim().slice(0, 50), step.action === 'remove' ? 'remove' : 'add')
          if (added) emitContactEvent({ type: 'tag_added', contactId: contact.id, tag: step.tag })
        }
        path = nextPath(steps, path)
        break
      case 'list':
        if (step.listId) {
          if (step.action === 'remove') sqlite.prepare('DELETE FROM list_contacts WHERE list_id = ? AND contact_id = ?').run(step.listId, contact.id)
          else if (sqlite.prepare('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)').run(step.listId, contact.id).changes) {
            emitContactEvent({ type: 'list_added', contactId: contact.id, listId: step.listId })
          }
        }
        path = nextPath(steps, path)
        break
      case 'field':
        if (step.key) {
          const vals = sanitizeCustomValues({ [step.key]: step.value ?? null })
          if (Object.keys(vals).length) {
            let custom: Record<string, unknown> = {}
            try { custom = JSON.parse(contact.custom || '{}') || {} } catch {}
            Object.assign(custom, vals)
            sqlite.prepare('UPDATE contacts SET custom = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(custom), Math.floor(Date.now() / 1000), contact.id)
          }
        }
        path = nextPath(steps, path)
        break
      case 'webhook':
        if (step.url) void fireWebhook(step.url, { event: 'automation.step', automationId: run.automation_id, contactId: contact.id, email: contact.email, context })
        path = nextPath(steps, path)
        break
      case 'exit':
        return finish('done')
      default:
        path = nextPath(steps, path)
    }
    sqlite.prepare(`UPDATE automation_runs SET status = 'active', cursor = ?, context = ? WHERE id = ?`)
      .run(path ? fmtPath(path) : null, JSON.stringify(context), run.id)
  }
  // Guard hit: park the run for the next tick instead of spinning
  sqlite.prepare(`UPDATE automation_runs SET next_run_at = ? WHERE id = ?`).run(Math.floor(Date.now() / 1000) + 60, run.id)
}

// ── Validation / carrier campaigns ──────────────────────────────────────────

const STEP_TYPES = ['email', 'wait', 'wait_until', 'condition', 'tag', 'list', 'field', 'webhook', 'exit']

export function validateSteps(input: unknown, depth = 0): AutoStep[] {
  if (depth > 4) throw new Error('Demasiados niveles de condiciones anidadas')
  if (!Array.isArray(input)) throw new Error('Pasos no válidos')
  if (input.length > 60) throw new Error('Demasiados pasos (máx. 60 por rama)')
  return input.map((raw: any, i) => {
    const type = String(raw?.type)
    if (!STEP_TYPES.includes(type)) throw new Error(`Paso ${i + 1}: tipo desconocido`)
    const s: AutoStep = { id: String(raw?.id || `s${Date.now().toString(36)}${i}`).slice(0, 40), type: type as AutoStep['type'] }
    switch (type) {
      case 'email':
        s.campaignId = raw?.campaignId ? Number(raw.campaignId) : null
        s.subject = String(raw?.subject || '').slice(0, 255)
        s.preheader = String(raw?.preheader || '').slice(0, 255)
        s.templateHtml = raw?.templateHtml ? String(raw.templateHtml) : undefined
        s.templateName = raw?.templateName ? String(raw.templateName).slice(0, 100) : undefined
        if (!s.subject.trim()) throw new Error(`Paso ${i + 1}: el email necesita asunto`)
        break
      case 'wait':
        s.amount = Math.max(1, Math.min(365, Number(raw?.amount) || 1))
        s.unit = ['minutes', 'hours', 'days'].includes(raw?.unit) ? raw.unit : 'days'
        break
      case 'wait_until':
        s.weekdays = (Array.isArray(raw?.weekdays) ? raw.weekdays : []).map(Number).filter((d: number) => d >= 0 && d <= 6)
        s.hour = Math.min(23, Math.max(0, Number(raw?.hour ?? 9)))
        break
      case 'condition': {
        const k = raw?.condition?.kind
        if (k === 'segment') s.condition = { kind: 'segment', rules: raw.condition.rules }
        else if (k === 'opened_last' || k === 'clicked_last') s.condition = { kind: k }
        else throw new Error(`Paso ${i + 1}: condición no válida`)
        s.yes = validateSteps(raw?.yes ?? [], depth + 1)
        s.no = validateSteps(raw?.no ?? [], depth + 1)
        break
      }
      case 'tag':
        s.action = raw?.action === 'remove' ? 'remove' : 'add'
        s.tag = String(raw?.tag || '').trim().slice(0, 50)
        if (!s.tag) throw new Error(`Paso ${i + 1}: indica la etiqueta`)
        break
      case 'list':
        s.action = raw?.action === 'remove' ? 'remove' : 'add'
        s.listId = Number(raw?.listId) || undefined
        if (!s.listId) throw new Error(`Paso ${i + 1}: elige una lista`)
        break
      case 'field':
        s.key = String(raw?.key || '')
        s.value = String(raw?.value ?? '').slice(0, 1000)
        break
      case 'webhook':
        s.url = String(raw?.url || '').trim()
        if (!/^https:\/\//i.test(s.url)) throw new Error(`Paso ${i + 1}: el webhook necesita una URL https`)
        break
    }
    return s
  })
}

/** Creates/updates the hidden carrier campaign of every email step. */
export function syncCarrierCampaigns(automationId: number, name: string, steps: AutoStep[]): void {
  const now = Math.floor(Date.now() / 1000)
  const visit = (list: AutoStep[]) => {
    for (const s of list) {
      if (s.type === 'email') {
        const exists = s.campaignId ? sqlite.prepare(`SELECT id FROM campaigns WHERE id = ? AND kind = 'automation'`).get(s.campaignId) : null
        if (exists) {
          sqlite.prepare(`UPDATE campaigns SET name = ?, subject = ?, preheader = ?, template_html = COALESCE(?, template_html), template_name = COALESCE(?, template_name) WHERE id = ?`)
            .run(`⚙ ${name} · ${s.subject}`.slice(0, 255), s.subject, s.preheader || null, s.templateHtml ?? null, s.templateName ?? null, s.campaignId)
        } else {
          s.campaignId = Number(sqlite.prepare(
            `INSERT INTO campaigns (name, subject, preheader, template_html, template_name, status, kind, created_at, total_recipients, sent_count, open_count, click_count, fail_count)
             VALUES (?, ?, ?, ?, ?, 'sent', 'automation', ?, 0, 0, 0, 0, 0)`,
          ).run(`⚙ ${name} · ${s.subject}`.slice(0, 255), s.subject, s.preheader || null, s.templateHtml ?? null, s.templateName ?? null, now).lastInsertRowid)
        }
        // The carrier holds the content; don't duplicate large HTML in the steps JSON
        delete s.templateHtml
      }
      if (s.yes) visit(s.yes)
      if (s.no) visit(s.no)
    }
  }
  visit(steps)
  void automationId
  invalidateAutomationCache()
}

/** Daily: birthday / anniversary / date-field triggers. */
export function enrollDateTriggers(): number {
  const autos = sqlite.prepare(`SELECT id, "trigger" AS trig FROM automations WHERE status = 'active'`).all() as { id: number; trig: string }[]
  let enrolled = 0
  const cutoff = Math.floor(Date.now() / 1000) - 300 * 86400
  for (const a of autos) {
    let trig: AutomationTrigger
    try { trig = JSON.parse(a.trig) } catch { continue }
    if (trig.type !== 'date' || !trig.field) continue
    const d = new Date(Date.now() + (Number(trig.offsetDays) || 0) * 86400_000)
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let rows: { id: number }[]
    if (trig.field === 'created_at') {
      rows = sqlite.prepare(`SELECT id FROM contacts WHERE status = 'active' AND strftime('%m-%d', created_at, 'unixepoch', 'localtime') = ? AND created_at < ?`)
        .all(md, Math.floor(Date.now() / 1000) - 180 * 86400) as { id: number }[]
    } else if (/^[a-z][a-z0-9_]{0,39}$/.test(trig.field)) {
      rows = sqlite.prepare(`SELECT id FROM contacts WHERE status = 'active' AND strftime('%m-%d', json_extract(custom, '$.${trig.field}')) = ?`).all(md) as { id: number }[]
    } else continue
    for (const r of rows) {
      const recent = sqlite.prepare('SELECT 1 FROM automation_runs WHERE automation_id = ? AND contact_id = ? AND started_at > ?').get(a.id, r.id, cutoff)
      if (!recent && enrollContact(a.id, r.id, { event: { type: 'date', field: trig.field } }, true)) enrolled++
    }
  }
  return enrolled
}
