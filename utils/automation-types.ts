// Automation step shape as edited in the builder (mirrors server AutoStep).

import type { SegGroup } from '~/utils/segment-types'

export type StepType = 'email' | 'wait' | 'wait_until' | 'condition' | 'tag' | 'list' | 'field' | 'webhook' | 'exit'

export interface AutoStepUI {
  id: string
  type: StepType
  campaignId?: number | null
  subject?: string
  preheader?: string
  templateHtml?: string
  templateName?: string
  amount?: number
  unit?: 'minutes' | 'hours' | 'days'
  weekdays?: number[]
  hour?: number
  condition?: { kind: 'segment'; rules: SegGroup } | { kind: 'opened_last' } | { kind: 'clicked_last' }
  yes?: AutoStepUI[]
  no?: AutoStepUI[]
  action?: 'add' | 'remove'
  tag?: string
  listId?: number
  key?: string
  value?: string
  url?: string
}

export const STEP_TYPES: StepType[] = ['email', 'wait', 'wait_until', 'condition', 'tag', 'list', 'field', 'webhook', 'exit']

export function stepId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function newStep(type: StepType): AutoStepUI {
  const s: AutoStepUI = { id: stepId(), type }
  switch (type) {
    case 'email': Object.assign(s, { subject: '', preheader: '', templateHtml: '' }); break
    case 'wait': Object.assign(s, { amount: 1, unit: 'days' }); break
    case 'wait_until': Object.assign(s, { weekdays: [1, 2, 3, 4, 5], hour: 10 }); break
    case 'condition': Object.assign(s, { condition: { kind: 'opened_last' }, yes: [], no: [] }); break
    case 'tag': Object.assign(s, { action: 'add', tag: '' }); break
    case 'list': Object.assign(s, { action: 'add' }); break
    case 'field': Object.assign(s, { key: '', value: '' }); break
    case 'webhook': Object.assign(s, { url: '' }); break
  }
  return s
}

/** Finds the list holding a step (for delete / move). */
export function findParentList(steps: AutoStepUI[], id: string): { list: AutoStepUI[]; index: number } | null {
  const i = steps.findIndex(s => s.id === id)
  if (i >= 0) return { list: steps, index: i }
  for (const s of steps) {
    for (const branch of [s.yes, s.no]) {
      if (!branch) continue
      const r = findParentList(branch, id)
      if (r) return r
    }
  }
  return null
}
