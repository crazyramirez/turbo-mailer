import { describe, it, expect } from 'vitest'
import { pickAbWinner, twoProportionPValue } from '~/server/utils/ab-stats'

describe('A/B winner with significance', () => {
  it('noise is not a winner: 3 vs 2 clicks keeps A', () => {
    const r = pickAbWinner({ delivered: 100, clicks: 2, confirmedOpens: 20 }, { delivered: 100, clicks: 3, confirmedOpens: 21 })
    expect(r).toMatchObject({ winner: 'A', basis: 'tie' })
  })

  it('a clear click difference wins', () => {
    const r = pickAbWinner({ delivered: 1000, clicks: 20, confirmedOpens: 200 }, { delivered: 1000, clicks: 60, confirmedOpens: 210 })
    expect(r.winner).toBe('B')
    expect(r.basis).toBe('clicks')
    expect(r.pValue!).toBeLessThan(0.05)
  })

  it('falls back to confirmed opens when clicks are inconclusive', () => {
    const r = pickAbWinner({ delivered: 1000, clicks: 10, confirmedOpens: 300 }, { delivered: 1000, clicks: 11, confirmedOpens: 200 })
    expect(r).toMatchObject({ winner: 'A', basis: 'opens' })
  })

  it('p-value sanity', () => {
    expect(twoProportionPValue(50, 100, 50, 100)).toBeCloseTo(1, 5)
    const p = twoProportionPValue(10, 100, 30, 100)!
    expect(p).toBeLessThan(0.01)
    expect(twoProportionPValue(0, 0, 1, 10)).toBeNull()
  })
})
