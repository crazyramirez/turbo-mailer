import { sqlite } from '~/server/db/index'
import { getSmtpProfiles, senderIdentity } from '~/server/utils/mailer'
import { domainHealth } from '~/server/utils/dns-deep'
import { latestBlocklistStatus } from '~/server/utils/blocklists'
import { providerOf, warmupCapForToday, sentToday } from '~/server/utils/send-limiter'
import { getImapConfig } from '~/server/utils/bounce-processor'
import { getSeeds } from '~/server/utils/placement'
import { jobsStatus } from '~/server/utils/jobs'
import { configFlag } from '~/server/utils/serverConfig'

// Deliverability dashboard data: domain authentication, reputation by
// receiving provider (last 30 days), blocklists, DMARC reports, suppression.
export default defineEventHandler(async () => {
  const config = useServerConfig()
  const since = Math.floor(Date.now() / 1000) - 30 * 86400

  // ── Domains ─────────────────────────────────────────────────────────────
  const profiles = getSmtpProfiles(config)
  const seenDomains = new Set<string>()
  const domains: any[] = []
  for (const p of profiles) {
    const id = senderIdentity(p, config)
    if (seenDomains.has(id.domain)) continue
    seenDomains.add(id.domain)
    try {
      const h = await domainHealth(id.domain, p.dkimSelector ? { domain: p.dkimDomain, selector: p.dkimSelector } : undefined)
      domains.push({ profile: p.name, from: id.email, ...h })
    } catch (err: any) {
      domains.push({ profile: p.name, from: id.email, domain: id.domain, error: String(err?.message || err) })
    }
  }

  // ── Reputation by receiving provider ───────────────────────────────────
  const byDomain = sqlite.prepare(
    `SELECT LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain,
            COUNT(*) FILTER (WHERE status IN ('sent', 'opened', 'bounced') OR (status = 'failed' AND bounce_class IN ('block', 'soft'))) AS attempted,
            COUNT(*) FILTER (WHERE status IN ('sent', 'opened')) AS delivered,
            COUNT(*) FILTER (WHERE status = 'bounced') AS hard,
            COUNT(*) FILTER (WHERE status = 'failed' AND bounce_class = 'block') AS blocked,
            COUNT(*) FILTER (WHERE status = 'opened' AND COALESCE(opened_by_proxy, 0) = 0) AS opens
     FROM sends WHERE sent_at >= ? GROUP BY domain`,
  ).all(since) as { domain: string; attempted: number; delivered: number; hard: number; blocked: number; opens: number }[]

  const eventsByDomain = sqlite.prepare(
    `SELECT LOWER(SUBSTR(s.email, INSTR(s.email, '@') + 1)) AS domain,
            COUNT(DISTINCT CASE WHEN te.event_type = 'complaint' THEN te.send_id END) AS complaints,
            COUNT(DISTINCT CASE WHEN te.event_type = 'unsubscribe' THEN te.send_id END) AS unsubscribes,
            COUNT(DISTINCT CASE WHEN te.event_type = 'click' THEN te.send_id END) AS clicks
     FROM tracking_events te JOIN sends s ON s.id = te.send_id
     WHERE te.created_at >= ? GROUP BY domain`,
  ).all(since) as { domain: string; complaints: number; unsubscribes: number; clicks: number }[]
  const evMap = new Map(eventsByDomain.map(e => [e.domain, e]))

  const providers = new Map<string, { provider: string; attempted: number; delivered: number; hard: number; blocked: number; opens: number; clicks: number; complaints: number; unsubscribes: number }>()
  for (const d of byDomain) {
    const key = providerOf(`x@${d.domain}`)
    const p = providers.get(key) ?? { provider: key, attempted: 0, delivered: 0, hard: 0, blocked: 0, opens: 0, clicks: 0, complaints: 0, unsubscribes: 0 }
    const ev = evMap.get(d.domain)
    p.attempted += d.attempted; p.delivered += d.delivered; p.hard += d.hard; p.blocked += d.blocked; p.opens += d.opens
    p.clicks += ev?.clicks ?? 0; p.complaints += ev?.complaints ?? 0; p.unsubscribes += ev?.unsubscribes ?? 0
    providers.set(key, p)
  }
  const reputation = [...providers.values()].sort((a, b) => b.attempted - a.attempted).map(p => ({
    ...p,
    bounceRate: p.attempted ? p.hard / p.attempted : 0,
    blockRate: p.attempted ? p.blocked / p.attempted : 0,
    complaintRate: p.delivered ? p.complaints / p.delivered : 0,
    openRate: p.delivered ? p.opens / p.delivered : 0,
    clickRate: p.delivered ? p.clicks / p.delivered : 0,
  }))

  // ── DMARC (last 30 days of reports) ─────────────────────────────────────
  const dmarc = sqlite.prepare(
    `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(dmarc_pass), 0) AS pass,
            COALESCE(SUM(spf_aligned), 0) AS spf, COALESCE(SUM(dkim_aligned), 0) AS dkim, COUNT(*) AS reports
     FROM dmarc_reports WHERE date_end >= ?`,
  ).get(since) as { total: number; pass: number; spf: number; dkim: number; reports: number }
  const dmarcRecent = sqlite.prepare(
    `SELECT org_name AS orgName, domain, policy, date_begin AS dateBegin, date_end AS dateEnd, total, dmarc_pass AS dmarcPass, sources
     FROM dmarc_reports ORDER BY date_end DESC LIMIT 20`,
  ).all() as any[]
  // Failing sources across recent reports (who sends as you and fails?)
  const failing = new Map<string, number>()
  for (const r of dmarcRecent) {
    try {
      for (const s of JSON.parse(r.sources || '[]')) {
        if (s.dkim !== 'pass' && s.spf !== 'pass') failing.set(s.ip, (failing.get(s.ip) ?? 0) + Number(s.count || 0))
      }
    } catch {}
  }

  // ── Suppression & list health ──────────────────────────────────────────
  const suppression = sqlite.prepare('SELECT reason, COUNT(*) AS n FROM suppressions GROUP BY reason').all() as { reason: string; n: number }[]
  const verification = sqlite.prepare(
    `SELECT json_extract(verification, '$.status') AS status, COUNT(*) AS n FROM contacts WHERE verification IS NOT NULL GROUP BY status`,
  ).all() as { status: string; n: number }[]

  const warmCap = warmupCapForToday(config)

  return {
    domains,
    reputation,
    blocklists: latestBlocklistStatus(),
    dmarc: {
      ...dmarc,
      passRate: dmarc.total ? dmarc.pass / dmarc.total : null,
      recent: dmarcRecent.map(r => ({ ...r, sources: undefined })),
      failingSources: [...failing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count })),
    },
    suppression: Object.fromEntries(suppression.map(s => [s.reason, s.n])),
    verification: Object.fromEntries(verification.map(v => [v.status, v.n])),
    warmup: {
      enabled: configFlag(config, 'warmupEnabled'),
      capToday: warmCap || null,
      sentToday: sentToday(),
    },
    inbound: { configured: !!getImapConfig(), bounceAddress: config.bounceAddress || null },
    seeds: getSeeds(config).map(s => ({ id: s.id, email: s.email, provider: s.provider || s.label || null })),
    spamCheck: !!String(config.spamCheckUrl || '').trim(),
    jobs: jobsStatus(),
  }
})
