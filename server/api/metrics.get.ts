import { createHash, timingSafeEqual } from 'node:crypto'
import { statSync } from 'node:fs'
import { sqlite, dbPath } from '~/server/db/index'
import { jobsStatus } from '~/server/utils/jobs'
import { activeRunIds } from '~/server/utils/send-engine'
import { aiUsageThisMonth } from '~/server/utils/ai/provider'
import { APP_VERSION } from '~/utils/version'

// Prometheus exposition format. Disabled until a metrics token is set in
// Settings → Integrations; scrape with "Authorization: Bearer <token>".

function tokenOk(given: string, expected: string): boolean {
  // Hash both sides: equal-length buffers, no length leak
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

export default defineEventHandler((event) => {
  const expected = String(useServerConfig().metricsToken || '')
  if (!expected) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const auth = getHeader(event, 'authorization') || ''
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(getQuery(event).token || '')
  if (!given || !tokenOk(given, expected)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const lines: string[] = []
  const metric = (name: string, help: string, type: 'gauge' | 'counter', samples: { labels?: Record<string, string | number>; value: number }[]) => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`)
    for (const s of samples) {
      const l = s.labels && Object.keys(s.labels).length
        ? `{${Object.entries(s.labels).map(([k, v]) => `${k}="${esc(String(v))}"`).join(',')}}`
        : ''
      lines.push(`${name}${l} ${Number.isFinite(s.value) ? s.value : 0}`)
    }
  }
  const grouped = (sql: string) => sqlite.prepare(sql).all() as { k: string; n: number }[]

  metric('turbomailer_info', 'Build information', 'gauge', [{ labels: { version: APP_VERSION, node: process.version }, value: 1 }])
  metric('turbomailer_contacts', 'Contacts by status', 'gauge',
    grouped('SELECT status AS k, COUNT(*) AS n FROM contacts GROUP BY status').map(r => ({ labels: { status: r.k }, value: r.n })))
  metric('turbomailer_campaigns', 'Campaigns by status', 'gauge',
    grouped(`SELECT status AS k, COUNT(*) AS n FROM campaigns WHERE kind = 'regular' GROUP BY status`).map(r => ({ labels: { status: r.k }, value: r.n })))
  metric('turbomailer_sends', 'Sends by status (all time)', 'gauge',
    grouped('SELECT status AS k, COUNT(*) AS n FROM sends GROUP BY status').map(r => ({ labels: { status: r.k }, value: r.n })))
  metric('turbomailer_sends_last_24h', 'Emails sent in the last 24 hours', 'gauge', [{
    value: (sqlite.prepare(`SELECT COUNT(*) AS n FROM sends WHERE sent_at >= strftime('%s', 'now', '-1 day') AND status IN ('sent', 'opened')`).get() as { n: number }).n,
  }])
  metric('turbomailer_queue_pending', 'Sends waiting to go out', 'gauge', [{
    value: (sqlite.prepare(`SELECT COUNT(*) AS n FROM sends WHERE status = 'pending'`).get() as { n: number }).n,
  }])
  metric('turbomailer_campaigns_sending', 'Campaigns with an active send run', 'gauge', [{ value: activeRunIds().length }])
  metric('turbomailer_events_last_24h', 'Tracking events in the last 24 hours', 'gauge',
    grouped(`SELECT event_type AS k, COUNT(*) AS n FROM tracking_events WHERE created_at >= strftime('%s', 'now', '-1 day') GROUP BY event_type`)
      .map(r => ({ labels: { type: r.k }, value: r.n })))
  metric('turbomailer_suppressions', 'Suppression list size by reason', 'gauge',
    grouped('SELECT reason AS k, COUNT(*) AS n FROM suppressions GROUP BY reason').map(r => ({ labels: { reason: r.k }, value: r.n })))
  metric('turbomailer_automation_runs', 'Automation runs by status', 'gauge',
    grouped('SELECT status AS k, COUNT(*) AS n FROM automation_runs GROUP BY status').map(r => ({ labels: { status: r.k }, value: r.n })))

  const jobs = jobsStatus()
  metric('turbomailer_job_last_run_timestamp_seconds', 'Last run of each background job', 'gauge',
    jobs.map(j => ({ labels: { job: j.name }, value: j.lastRunAt ? Math.floor(j.lastRunAt / 1000) : 0 })))
  metric('turbomailer_job_failing', '1 when the last run of a job failed', 'gauge',
    jobs.map(j => ({ labels: { job: j.name }, value: j.lastError ? 1 : 0 })))

  const ai = aiUsageThisMonth()
  metric('turbomailer_ai_calls_month', 'AI requests this month', 'gauge', [{ value: ai.calls }])
  metric('turbomailer_ai_tokens_month', 'AI tokens this month', 'gauge', [
    { labels: { direction: 'input' }, value: ai.input },
    { labels: { direction: 'output' }, value: ai.output },
  ])

  let dbSize = 0
  for (const f of [dbPath, `${dbPath}-wal`]) {
    try { dbSize += statSync(f).size } catch {}
  }
  metric('turbomailer_db_size_bytes', 'SQLite database size (with WAL)', 'gauge', [{ value: dbSize }])
  metric('process_resident_memory_bytes', 'Resident memory', 'gauge', [{ value: process.memoryUsage().rss }])
  metric('process_uptime_seconds', 'Process uptime', 'gauge', [{ value: Math.round(process.uptime()) }])

  setHeader(event, 'Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  return `${lines.join('\n')}\n`
})
