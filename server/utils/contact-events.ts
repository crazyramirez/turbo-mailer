import { sqlite } from '~/server/db/index'

// Contact events → automation enrollment.
//
// Everything that can start an automation calls emitContactEvent(). Matching
// only inserts an automation_runs row; the automation engine executes the
// steps (right away for immediate steps, or on the scheduler tick).

export type ContactEvent =
  | { type: 'subscribed'; contactId: number; listIds?: number[]; source?: string }
  | { type: 'list_added'; contactId: number; listId: number }
  | { type: 'tag_added'; contactId: number; tag: string }
  | { type: 'form_submitted'; contactId: number; formId: number }
  | { type: 'email_opened'; contactId: number; campaignId: number }
  | { type: 'link_clicked'; contactId: number; campaignId: number; url: string }
  | { type: 'api_event'; contactId: number; event: string; data?: Record<string, unknown> }

export interface AutomationTrigger {
  type: 'subscribed' | 'list_added' | 'tag_added' | 'form_submitted' | 'email_opened' | 'link_clicked' | 'api_event' | 'date' | 'manual'
  listId?: number | null
  tag?: string
  formId?: number | null
  campaignId?: number | null
  urlContains?: string
  event?: string
  // date trigger
  field?: string
  offsetDays?: number
  hour?: number
}

let activeCache: { at: number; rows: { id: number; trigger: AutomationTrigger; allowReentry: boolean }[] } | null = null

export function invalidateAutomationCache(): void {
  activeCache = null
}

function activeAutomations() {
  if (activeCache && Date.now() - activeCache.at < 10_000) return activeCache.rows
  let rows: { id: number; trigger: AutomationTrigger; allowReentry: boolean }[] = []
  try {
    rows = (sqlite.prepare(`SELECT id, "trigger" AS trig, allow_reentry AS allowReentry FROM automations WHERE status = 'active'`).all() as any[])
      .map(r => {
        let trigger: AutomationTrigger = { type: 'manual' }
        try { trigger = JSON.parse(r.trig) } catch {}
        return { id: r.id, trigger, allowReentry: !!r.allowReentry }
      })
  } catch {
    rows = []
  }
  activeCache = { at: Date.now(), rows }
  return rows
}

export function triggerMatches(t: AutomationTrigger, e: ContactEvent): boolean {
  if (t.type !== e.type) return false
  switch (e.type) {
    case 'subscribed':
      return !t.listId || (e.listIds ?? []).includes(Number(t.listId))
    case 'list_added':
      return Number(t.listId) === e.listId
    case 'tag_added':
      return !!t.tag && t.tag.trim().toLowerCase() === e.tag.trim().toLowerCase()
    case 'form_submitted':
      return !t.formId || Number(t.formId) === e.formId
    case 'email_opened':
      return !t.campaignId || Number(t.campaignId) === e.campaignId
    case 'link_clicked':
      return (!t.campaignId || Number(t.campaignId) === e.campaignId)
        && (!t.urlContains || e.url.toLowerCase().includes(t.urlContains.toLowerCase()))
    case 'api_event':
      return !!t.event && t.event === e.event
  }
  return false
}

/**
 * Puts a contact into an automation. Skips when a run is already in progress,
 * or when the contact already went through it and re-entry is off.
 */
export function enrollContact(automationId: number, contactId: number, context: Record<string, unknown>, allowReentry: boolean): boolean {
  const existing = sqlite.prepare(
    `SELECT status FROM automation_runs WHERE automation_id = ? AND contact_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(automationId, contactId) as { status: string } | undefined
  if (existing && (existing.status === 'active' || existing.status === 'waiting')) return false
  if (existing && !allowReentry) return false
  const now = Math.floor(Date.now() / 1000)
  sqlite.prepare(
    `INSERT INTO automation_runs (automation_id, contact_id, status, cursor, next_run_at, context, started_at)
     VALUES (?, ?, 'active', '0', ?, ?, ?)`,
  ).run(automationId, contactId, now, JSON.stringify(context), now)
  return true
}

let kickScheduled = false

/** Never throws: an automation problem must not break a signup or a click. */
export function emitContactEvent(e: ContactEvent): void {
  try {
    const autos = activeAutomations()
    if (!autos.length) return
    let enrolled = 0
    for (const a of autos) {
      if (triggerMatches(a.trigger, e) && enrollContact(a.id, e.contactId, { event: e }, a.allowReentry)) enrolled++
    }
    if (enrolled && !kickScheduled) {
      kickScheduled = true
      // Run immediate steps (e.g. a welcome email) without waiting for the tick
      setTimeout(() => {
        kickScheduled = false
        import('~/server/utils/automation-engine')
          .then(m => m.processDueRuns())
          .catch(err => console.error('[automations] immediate run failed:', err))
      }, 500)
    }
  } catch (err) {
    console.error('[contact-events] failed:', err)
  }
}
