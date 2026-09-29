import { sqlite } from '~/server/db/index'
import { pickAbWinner } from '~/server/utils/ab-stats'
import { clearSignal } from '~/server/utils/campaign-state'
import { startCampaign } from '~/server/utils/send-engine'
import { logAudit } from '~/server/utils/audit'

// Ends an A/B subject test: fixes the winner, releases the held-back holdout
// ('held' → 'pending') and lets the engine send it. Used by the scheduler when
// abDecideAt passes and by the "send now" buttons on the campaign page.
//
//   waiting  the sample run is over (engine idle): any choice is safe; 'auto'
//            decides on the data so far with the same significance test.
//   sample   the sample is still going out and the running engine compiled
//            the subjects when it started — for holdout sends that means A.
//            So mid-sample only 'A' (cancel the test) is accepted.
//
// Atomic: the phase change is conditional, so the scheduler and a click at
// the same moment can't both release the holdout.

export type AbChoice = 'A' | 'B' | 'auto'

export interface VariantStats { delivered: number; clicks: number; confirmedOpens: number; rawOpens: number }

export interface AbDecision {
  winner: 'A' | 'B'
  basis: 'clicks' | 'opens' | 'tie' | 'manual'
  pValue: number | null
  released: number
  status: string
  a: VariantStats
  b: VariantStats
}

export class AbDecideError extends Error {
  constructor(public code: 'not_found' | 'not_ab' | 'sample_needs_a', message: string) { super(message) }
}

/**
 * Ranked by clicks first, then confirmed (non-proxy) opens. Raw opens are
 * unusable as a decision metric: privacy relays prefetch the pixel without a
 * human, so they're reported but never decide.
 */
export function abVariantStats(campaignId: number): { a: VariantStats; b: VariantStats } {
  const rows = sqlite.prepare(
    `SELECT s.variant AS variant,
       COUNT(DISTINCT CASE WHEN s.status IN ('sent', 'opened') THEN s.id END) AS delivered,
       COUNT(DISTINCT CASE WHEN t.event_type = 'click' THEN s.id END) AS clicks,
       COUNT(DISTINCT CASE WHEN s.status = 'opened' AND COALESCE(s.opened_by_proxy, 0) = 0 THEN s.id END) AS confirmedOpens,
       COUNT(DISTINCT CASE WHEN s.status = 'opened' THEN s.id END) AS rawOpens
     FROM sends s LEFT JOIN tracking_events t ON t.send_id = s.id
     WHERE s.campaign_id = ? AND s.variant IN ('A', 'B')
     GROUP BY s.variant`,
  ).all(campaignId) as ({ variant: 'A' | 'B' } & VariantStats)[]
  const statFor = (v: 'A' | 'B'): VariantStats => {
    const row = rows.find(r => r.variant === v)
    return {
      delivered: Number(row?.delivered ?? 0),
      clicks: Number(row?.clicks ?? 0),
      confirmedOpens: Number(row?.confirmedOpens ?? 0),
      rawOpens: Number(row?.rawOpens ?? 0),
    }
  }
  return { a: statFor('A'), b: statFor('B') }
}

/** Returns null when the test was already decided (nothing to do). */
export function decideAbTest(campaignId: number, choice: AbChoice = 'auto', by: 'scheduler' | 'user' = 'user', ip?: string): AbDecision | null {
  const campaign = sqlite.prepare('SELECT status, subject_b AS subjectB, ab_phase AS abPhase FROM campaigns WHERE id = ?')
    .get(campaignId) as { status: string; subjectB: string | null; abPhase: string | null } | undefined
  if (!campaign) throw new AbDecideError('not_found', 'Campaign not found')
  if (campaign.abPhase === 'final') return null
  if (campaign.abPhase !== 'waiting' && campaign.abPhase !== 'sample') {
    throw new AbDecideError('not_ab', 'Esta campaña no tiene un test A/B en curso')
  }
  if (campaign.abPhase === 'sample' && choice !== 'A') {
    throw new AbDecideError('sample_needs_a', 'La muestra aún se está enviando: solo se puede cancelar el test y enviar A al resto')
  }

  const { a, b } = abVariantStats(campaignId)
  const picked = choice === 'auto' ? pickAbWinner(a, b) : { winner: choice, basis: 'manual' as const, pValue: null }

  const apply = sqlite.transaction(() => {
    const row = sqlite.prepare(
      `UPDATE campaigns SET ab_phase = 'final', ab_winner = ? WHERE id = ? AND ab_phase = ? RETURNING status`,
    ).get(picked.winner, campaignId, campaign.abPhase) as { status: string } | undefined
    if (!row) return null
    const released = sqlite.prepare(`UPDATE sends SET status = 'pending' WHERE campaign_id = ? AND status = 'held'`).run(campaignId).changes
    return { status: row.status, released }
  })
  const done = apply()
  if (!done) return null

  logAudit('campaign.ab_decided', { campaignId, winner: picked.winner, basis: picked.basis, pValue: picked.pValue, a, b, by, released: done.released }, ip)
  // A paused campaign stays paused: the holdout goes out when the user resumes
  if (done.status === 'sending') {
    clearSignal(campaignId)
    startCampaign(campaignId)
  }
  return { ...picked, ...done, a, b }
}
