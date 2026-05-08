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
