import { sqlite } from '~/server/db/index'
import { configFlag, configNumber } from '~/server/utils/serverConfig'

// Pace control shared by EVERY campaign running in the process.
//
// Before, each campaign slept its own delay: an A/B final wave + a drip
// follow-up + a scheduled campaign running together tripled the rate the
// provider saw. Now all of them draw slots from the same pacers:
//
//   global      smtpSendDelayMs / smtpMaxEmailsPerSecond (+ jitter)
//   profile     per-SMTP-profile maxPerSecond
//   provider    receiving mailbox provider (gmail / microsoft / yahoo...)
//   daily cap   warm-up schedule and provider daily quotas

export class Pacer {
  private nextSlotAt = 0

  /** Reserves the next slot `intervalMs` after the previous one and waits for it. */
  async acquire(intervalMs: number, jitterMs = 0): Promise<void> {
    if (intervalMs <= 0 && this.nextSlotAt <= Date.now()) return
    const now = Date.now()
    const slot = Math.max(now, this.nextSlotAt)
    const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs * 2) - jitterMs : 0
    this.nextSlotAt = slot + Math.max(0, intervalMs + jitter)
    if (slot > now) await sleep(slot - now)
  }

  /** Pushes the next slot out — used when the provider says "slow down". */
  penalize(ms: number): void {
    this.nextSlotAt = Math.max(this.nextSlotAt, Date.now() + ms)
  }

  reset(): void {
    this.nextSlotAt = 0
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, Math.max(0, ms)))
}

const globalPacer = new Pacer()
const profilePacers = new Map<string, Pacer>()
const providerPacers = new Map<string, Pacer>()

// Receiving-provider groups: throttles are enforced per mailbox provider,
// because that's where reputation and rate limits live.
const PROVIDER_DOMAINS: Record<string, string[]> = {
  google: ['gmail.com', 'googlemail.com'],
  microsoft: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'hotmail.es', 'outlook.es', 'live.es', 'hotmail.co.uk', 'hotmail.fr'],
  yahoo: ['yahoo.com', 'yahoo.es', 'ymail.com', 'rocketmail.com', 'aol.com', 'yahoo.co.uk', 'yahoo.fr'],
  apple: ['icloud.com', 'me.com', 'mac.com'],
}
const DOMAIN_TO_PROVIDER = new Map<string, string>()
for (const [provider, domains] of Object.entries(PROVIDER_DOMAINS)) {
  domains.forEach(d => DOMAIN_TO_PROVIDER.set(d, provider))
}

export function providerOf(email: string): string {
  const domain = String(email).split('@').pop()?.toLowerCase() ?? ''
  return DOMAIN_TO_PROVIDER.get(domain) ?? 'other'
}

export function globalIntervalMs(config: Record<string, any>): { interval: number; jitter: number } {
  const delay = Math.max(0, configNumber(config, 'smtpSendDelayMs', 2000))
  const perSecond = configNumber(config, 'smtpMaxEmailsPerSecond', 0)
  const byRate = perSecond > 0 ? 1000 / perSecond : 0
  const interval = Math.max(delay, byRate)
  const jitter = Math.min(Math.max(0, configNumber(config, 'smtpSendJitterMs', 500)), interval)
  return { interval, jitter }
}

/** Waits for a slot on every applicable pacer. */
export async function acquireSendSlot(config: Record<string, any>, opts: { profileId: string; profileMaxPerSecond?: number; recipient: string }): Promise<void> {
  const provider = providerOf(opts.recipient)
  const perMinute = configNumber(config, `throttle_${provider}`, 0)
  if (perMinute > 0) {
    let p = providerPacers.get(provider)
    if (!p) providerPacers.set(provider, (p = new Pacer()))
    await p.acquire(60_000 / perMinute)
  }
  if (opts.profileMaxPerSecond && opts.profileMaxPerSecond > 0) {
    let p = profilePacers.get(opts.profileId)
    if (!p) profilePacers.set(opts.profileId, (p = new Pacer()))
    await p.acquire(1000 / opts.profileMaxPerSecond)
  }
  const { interval, jitter } = globalIntervalMs(config)
  await globalPacer.acquire(interval, jitter)
}

export function penalizeProvider(recipient: string, ms: number): void {
  const provider = providerOf(recipient)
  let p = providerPacers.get(provider)
  if (!p) providerPacers.set(provider, (p = new Pacer()))
  p.penalize(ms)
}

export function penalizeGlobal(ms: number): void {
  globalPacer.penalize(ms)
}

// ── Daily caps (warm-up + provider quotas) ────────────────────────────────

export function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function nextLocalMidnight(d = new Date()): Date {
  const x = startOfLocalDay(d)
  x.setDate(x.getDate() + 1)
  return x
}

/**
 * Warm-up cap for today: start × (1 + growth)^days, capped at max.
 * Returns 0 when warm-up is off (no cap).
 */
export function warmupCapForToday(config: Record<string, any>, now = new Date()): number {
  if (!configFlag(config, 'warmupEnabled')) return 0
  const start = Math.max(1, configNumber(config, 'warmupStartVolume', 50))
  const growth = Math.max(0, configNumber(config, 'warmupGrowthPct', 30)) / 100
  const max = Math.max(start, configNumber(config, 'warmupMaxPerDay', 50_000))
  const startedAt = config.warmupStartDate ? new Date(config.warmupStartDate) : now
  const days = Math.max(0, Math.floor((startOfLocalDay(now).getTime() - startOfLocalDay(startedAt).getTime()) / 86_400_000))
  const cap = Math.round(start * Math.pow(1 + growth, days))
  return cap >= max ? 0 : cap // reached the target: warm-up is over
}

let dayCounter = { day: 0, total: 0, byProfile: new Map<string, number>(), syncedAt: 0 }

function syncDayCounter(): void {
  const today = startOfLocalDay().getTime()
  const fresh = dayCounter.day !== today || Date.now() - dayCounter.syncedAt > 5 * 60_000
  if (!fresh) return
  const since = Math.floor(today / 1000)
  const rows = sqlite.prepare(
    `SELECT COALESCE(profile_id, 'default') AS profile, COUNT(*) AS n FROM sends
     WHERE sent_at >= ? AND status IN ('sent', 'opened', 'bounced', 'sending')
     GROUP BY COALESCE(profile_id, 'default')`,
  ).all(since) as { profile: string; n: number }[]
  const byProfile = new Map<string, number>()
  let total = 0
  for (const r of rows) { byProfile.set(r.profile, r.n); total += r.n }
  dayCounter = { day: today, total, byProfile, syncedAt: Date.now() }
}

export function recordSentToday(profileId: string): void {
  syncDayCounter()
  dayCounter.total++
  dayCounter.byProfile.set(profileId, (dayCounter.byProfile.get(profileId) ?? 0) + 1)
}

export function sentToday(profileId?: string): number {
  syncDayCounter()
  return profileId ? (dayCounter.byProfile.get(profileId) ?? 0) : dayCounter.total
}

/** null when a send may go out now; otherwise why not and until when. */
export function dailyCapBlock(config: Record<string, any>, profile: { id: string; dailyLimit?: number }): { reason: 'warmup' | 'profile_quota'; until: Date } | null {
  const warmCap = warmupCapForToday(config)
  if (warmCap > 0 && sentToday() >= warmCap) return { reason: 'warmup', until: nextLocalMidnight() }
  if (profile.dailyLimit && profile.dailyLimit > 0 && sentToday(profile.id) >= profile.dailyLimit) {
    return { reason: 'profile_quota', until: nextLocalMidnight() }
  }
  return null
}

/** Test hook */
export function _resetLimiterState(): void {
  globalPacer.reset()
  profilePacers.clear()
  providerPacers.clear()
  dayCounter = { day: 0, total: 0, byProfile: new Map(), syncedAt: 0 }
}
