import { describe, it, expect, vi } from 'vitest'

vi.mock('~/server/db/index', () => ({ db: {}, sqlite: {} }))

import { planAbSplit } from '~/server/utils/send-setup'

const recipients = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

describe('planAbSplit', () => {
  it('splits the sample evenly between A and B and holds the rest', () => {
    const plan = planAbSplit(recipients(100), 20)
    const a = plan.filter(p => p.variant === 'A').length
    const b = plan.filter(p => p.variant === 'B').length
    const held = plan.filter(p => p.status === 'held').length

    expect(a + b).toBe(20)
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
    expect(held).toBe(80)
    expect(plan.filter(p => p.status === 'held').every(p => p.variant === null)).toBe(true)
  })

  it('clamps the sample percentage to 5–50', () => {
    expect(planAbSplit(recipients(100), 90).filter(p => p.status === 'pending').length).toBe(50)
    expect(planAbSplit(recipients(100), 1).filter(p => p.status === 'pending').length).toBe(5)
    expect(planAbSplit(recipients(100), NaN).filter(p => p.status === 'pending').length).toBe(20)
  })

  it('enforces a minimum sample of 4 on small lists', () => {
    const plan = planAbSplit(recipients(12), 10) // 10% of 12 = 1.2 → min 4
    expect(plan.filter(p => p.status === 'pending').length).toBe(4)
    expect(plan.filter(p => p.variant === 'A').length).toBe(2)
    expect(plan.filter(p => p.variant === 'B').length).toBe(2)
  })

  it('never loses or duplicates recipients', () => {
    const plan = planAbSplit(recipients(37), 25)
    const ids = plan.map(p => (p.item as any).id).sort((x, y) => x - y)
    expect(ids).toEqual(recipients(37).map(r => r.id))
  })
})
