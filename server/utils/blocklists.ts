import { promises as dns } from 'node:dns'
import { sqlite } from '~/server/db/index'
import { getSmtpProfiles, senderIdentity } from '~/server/utils/mailer'
import { sendAlert } from '~/server/utils/alerts'

// DNS blocklist monitoring of the sending infrastructure.
//
// False alarms are the enemy here: Spamhaus answers 127.255.255.25x ("query
// refused", e.g. through a public resolver like 8.8.8.8) and URIBL answers
// 127.0.0.1 for the same reason. Those are recorded as 'unknown' — only real
// listing codes count as 'listed'.

interface Zone {
  zone: string
  type: 'ip' | 'domain'
  name: string
  /** Is this A-record answer a genuine listing? */
  listed: (answer: string) => boolean
}

const spamhausErr = (a: string) => a.startsWith('127.255.255.')

export const ZONES: Zone[] = [
  { zone: 'zen.spamhaus.org', type: 'ip', name: 'Spamhaus ZEN', listed: a => /^127\.0\.0\.(2|3|4|9|10|11)$/.test(a) && !spamhausErr(a) },
  { zone: 'b.barracudacentral.org', type: 'ip', name: 'Barracuda', listed: a => a === '127.0.0.2' },
  { zone: 'bl.spamcop.net', type: 'ip', name: 'SpamCop', listed: a => a === '127.0.0.2' },
  { zone: 'psbl.surriel.com', type: 'ip', name: 'PSBL', listed: a => a === '127.0.0.2' },
  { zone: 'bl.mailspike.net', type: 'ip', name: 'Mailspike', listed: a => /^127\.0\.0\.(2|10|11|12|13|14)$/.test(a) },
  { zone: 'ix.dnsbl.manitu.net', type: 'ip', name: 'NiX Spam', listed: a => a === '127.0.0.2' },
  { zone: 'dbl.spamhaus.org', type: 'domain', name: 'Spamhaus DBL', listed: a => /^127\.0\.1\.\d+$/.test(a) && a !== '127.0.1.255' },
  { zone: 'multi.surbl.org', type: 'domain', name: 'SURBL', listed: a => /^127\.0\.0\.\d+$/.test(a) && a !== '127.0.0.1' },
  { zone: 'multi.uribl.com', type: 'domain', name: 'URIBL', listed: a => /^127\.0\.0\.(2|4|8|14)$/.test(a) },
]

function reverseIp(ip: string): string | null {
  const parts = ip.split('.')
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p))) return null
  return parts.reverse().join('.')
}

async function lookup(name: string): Promise<{ answers: string[]; error?: string }> {
  try {
    return { answers: await dns.resolve4(name) }
  } catch (err: any) {
    if (['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(err?.code)) return { answers: [] }
    return { answers: [], error: err?.code || 'dns_error' }
  }
}

export interface BlocklistResult { target: string; targetType: 'ip' | 'domain'; zone: string; name: string; result: 'listed' | 'clean' | 'unknown'; detail?: string }

export async function checkTarget(target: string, type: 'ip' | 'domain'): Promise<BlocklistResult[]> {
  const zones = ZONES.filter(z => z.type === type)
  const prefix = type === 'ip' ? reverseIp(target) : target.toLowerCase()
  if (!prefix) return []
  return Promise.all(zones.map(async (z) => {
    const { answers, error } = await lookup(`${prefix}.${z.zone}`)
    if (error) return { target, targetType: type, zone: z.zone, name: z.name, result: 'unknown' as const, detail: error }
    if (!answers.length) return { target, targetType: type, zone: z.zone, name: z.name, result: 'clean' as const }
    const genuine = answers.filter(z.listed)
    if (genuine.length) return { target, targetType: type, zone: z.zone, name: z.name, result: 'listed' as const, detail: genuine.join(',') }
    return { target, targetType: type, zone: z.zone, name: z.name, result: 'unknown' as const, detail: `query refused (${answers.join(',')})` }
  }))
}

/** What to monitor: sending IPs (SMTP hosts + configured IPs) and domains. */
export async function monitorTargets(config: Record<string, any>): Promise<{ ips: string[]; domains: string[] }> {
  const ips = new Set<string>()
  const domains = new Set<string>()
  for (const ip of String(config.sendingIps || '').split(/[\s,]+/).filter(Boolean)) ips.add(ip)
  for (const p of getSmtpProfiles(config)) {
    try {
      const addrs = await dns.resolve4(p.host)
      addrs.forEach(a => ips.add(a))
    } catch {}
    domains.add(senderIdentity(p, config).domain)
  }
  try {
    const track = new URL(String(config.trackingBaseUrl || '')).hostname
    if (track && !/^(localhost|127\.|\d+\.\d+\.\d+\.\d+$)/.test(track)) domains.add(track)
  } catch {}
  return { ips: [...ips].filter(ip => !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)), domains: [...domains] }
}

export async function runBlocklistCheck(config: Record<string, any>): Promise<BlocklistResult[]> {
  const { ips, domains } = await monitorTargets(config)
  const results: BlocklistResult[] = []
  for (const ip of ips) results.push(...await checkTarget(ip, 'ip'))
  for (const d of domains) results.push(...await checkTarget(d, 'domain'))

  const now = Math.floor(Date.now() / 1000)
  const ins = sqlite.prepare('INSERT INTO blocklist_checks (target, target_type, zone, result, detail, checked_at) VALUES (?, ?, ?, ?, ?, ?)')
  sqlite.transaction(() => {
    for (const r of results) ins.run(r.target, r.targetType, r.zone, r.result, r.detail ?? null, now)
    // Keep 90 days of history
    sqlite.prepare('DELETE FROM blocklist_checks WHERE checked_at < ?').run(now - 90 * 86400)
  })()

  const listed = results.filter(r => r.result === 'listed')
  if (listed.length) {
    sendAlert('critical', 'Infraestructura en lista negra',
      listed.map(l => `${l.target} en ${l.name} (${l.detail})`).join('\n') + '\nRevisa la sección Entregabilidad para los pasos de delisting.',
      `blocklist:${listed.map(l => `${l.target}@${l.zone}`).sort().join('|')}`)
  }
  return results
}

export function latestBlocklistStatus() {
  const last = sqlite.prepare('SELECT MAX(checked_at) AS at FROM blocklist_checks').get() as { at: number | null }
  if (!last.at) return { checkedAt: null, results: [] as any[] }
  const rows = sqlite.prepare('SELECT target, target_type AS targetType, zone, result, detail FROM blocklist_checks WHERE checked_at = ?').all(last.at) as any[]
  const names = new Map(ZONES.map(z => [z.zone, z.name]))
  return { checkedAt: new Date(last.at * 1000).toISOString(), results: rows.map(r => ({ ...r, name: names.get(r.zone) ?? r.zone })) }
}
