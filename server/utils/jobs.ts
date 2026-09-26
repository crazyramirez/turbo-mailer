import { sqlite } from '~/server/db/index'

// Minimal in-process job runner for the scheduler plugin.
//
// - Interval jobs run every N minutes; a job never overlaps with itself (a
//   slow tick is skipped, not stacked).
// - Daily jobs run once per local day at/after a given hour; the last run is
//   persisted in the settings table so a restart doesn't re-run them.

interface Job {
  name: string
  everyMinutes: number
  dailyAtHour: number | null
  fn: () => Promise<unknown> | unknown
  guard?: () => boolean
  running: boolean
  lastRunAt: number
  lastError: string | null
  lastDurationMs: number
}

const jobs = new Map<string, Job>()

export function registerJob(name: string, everyMinutes: number, fn: Job['fn'], guard?: () => boolean): void {
  jobs.set(name, { name, everyMinutes, dailyAtHour: null, fn, guard, running: false, lastRunAt: 0, lastError: null, lastDurationMs: 0 })
}

export function registerDailyJob(name: string, atHour: number, fn: Job['fn'], guard?: () => boolean): void {
  jobs.set(name, { name, everyMinutes: 0, dailyAtHour: atHour, fn, guard, running: false, lastRunAt: 0, lastError: null, lastDurationMs: 0 })
}

function dailyKey(name: string) {
  return `job:last:${name}`
}

function lastDailyRun(name: string): number {
  try {
    const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(dailyKey(name)) as { value: string } | undefined
    return row ? Number(row.value) || 0 : 0
  } catch {
    return 0
  }
}

function markDailyRun(name: string, at: number) {
  try {
    sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(dailyKey(name), String(at), Math.floor(at / 1000))
  } catch {}
}

function isDue(job: Job, now: Date): boolean {
  if (job.dailyAtHour !== null) {
    if (now.getHours() < job.dailyAtHour) return false
    const last = job.lastRunAt || lastDailyRun(job.name)
    if (!last) return true
    const lastDay = new Date(last)
    return lastDay.toDateString() !== now.toDateString()
  }
  return Date.now() - job.lastRunAt >= job.everyMinutes * 60_000 - 1000
}

async function execute(job: Job): Promise<void> {
  job.running = true
  const started = Date.now()
  try {
    await job.fn()
    job.lastError = null
  } catch (err: any) {
    job.lastError = String(err?.message || err).slice(0, 300)
    console.error(`[jobs] ${job.name} failed:`, err)
  } finally {
    job.running = false
    job.lastRunAt = started
    job.lastDurationMs = Date.now() - started
    if (job.dailyAtHour !== null) markDailyRun(job.name, started)
  }
}

export async function runScheduledJobs(): Promise<void> {
  const now = new Date()
  for (const job of jobs.values()) {
    if (job.running || !isDue(job, now)) continue
    if (job.guard && !job.guard()) continue
    // Sequential by design: jobs touch the same SQLite database
    await execute(job)
  }
}

/** Runs a job right now (manual trigger from the UI). */
export async function runJobNow(name: string): Promise<boolean> {
  const job = jobs.get(name)
  if (!job || job.running) return false
  await execute(job)
  return true
}

export function jobsStatus() {
  return [...jobs.values()].map(j => ({
    name: j.name,
    everyMinutes: j.everyMinutes,
    dailyAtHour: j.dailyAtHour,
    running: j.running,
    lastRunAt: j.lastRunAt || (j.dailyAtHour !== null ? lastDailyRun(j.name) : 0) || null,
    lastError: j.lastError,
    lastDurationMs: j.lastDurationMs,
  }))
}
