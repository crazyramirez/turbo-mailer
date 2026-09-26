import { sqlite } from '~/server/db/index'

// In-memory pause signals for active campaigns.
// The send loop checks this map instead of querying the DB on every iteration,
// eliminating N+1 queries (50k DB calls → 0 for a 50k email campaign).
const pauseSignals = new Map<number, boolean>()

export function signalPause(id: number): void {
  pauseSignals.set(id, true)
}

export function clearSignal(id: number): void {
  pauseSignals.delete(id)
}

export function isPaused(id: number): boolean {
  return pauseSignals.get(id) === true
}

/**
 * Pauses a running campaign from the server side (circuit breaker, SMTP
 * outage, complaint spike): stops the loop and records why.
 */
export function pauseCampaign(id: number, reason: string | null): void {
  signalPause(id)
  sqlite.prepare(`UPDATE campaigns SET status = 'paused', pause_reason = ? WHERE id = ? AND status = 'sending'`).run(reason, id)
}
