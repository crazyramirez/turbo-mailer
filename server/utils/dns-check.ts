// Sender-domain DNS authentication check: SPF, DMARC and (when configured) DKIM.
// Poor/missing records are the #1 cause of bulk mail landing in spam, so the
// precheck surfaces them before every send. Results are cached briefly — DNS
// answers don't change mid-session and the precheck may be polled by the UI.

import { promises as dns } from 'node:dns'

export interface DnsAuthResult {
  domain: string
  spf: { found: boolean; record?: string }
  dmarc: { found: boolean; policy?: string; record?: string }
  dkim?: { found: boolean; selector: string }
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; result: DnsAuthResult }>()

// Authoritative "no record" answers — an empty result is trustworthy
const NO_RECORD_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN'])

// Node's c-ares resolver can't reach some system resolvers (e.g. Windows
// link-local IPv6 DNS → ECONNREFUSED) even when the OS resolves fine.
// Fall back to DNS-over-HTTPS so the check reflects reality instead of
// reporting every record as missing.
async function resolveTxtViaDoH(name: string): Promise<string[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    },
  )
  if (!res.ok) throw new Error(`DoH query failed: ${res.status}`)
  const json = await res.json() as { Answer?: { type: number; data: string }[] }
  // TXT answers come quoted and possibly chunked: "part1" "part2"
  return (json.Answer ?? [])
    .filter(a => a.type === 16)
    .map(a => a.data.replace(/"\s+"/g, '').replace(/^"|"$/g, ''))
}

async function resolveTxtJoined(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name)
    // TXT answers arrive split into 255-byte chunks — join each record back
    return records.map(chunks => chunks.join(''))
  } catch (err: any) {
    if (NO_RECORD_CODES.has(err?.code)) return []
    // Resolver unreachable/misbehaving — try DoH before giving up
    try {
      return await resolveTxtViaDoH(name)
    } catch {
      // Signal "unknown" to the caller — do NOT report a false missing-record
      throw new Error(`DNS unavailable for ${name}`)
    }
  }
}

export function senderDomainFromEmail(email: unknown): string | null {
  const m = String(email ?? '').match(/@([a-z0-9.-]+\.[a-z]{2,})$/i)
  return m ? m[1].toLowerCase() : null
}

export async function checkDnsAuth(
  domain: string,
  dkimSelector?: string,
): Promise<DnsAuthResult> {
  const cacheKey = `${domain}|${dkimSelector ?? ''}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result

  const [domainTxt, dmarcTxt, dkimTxt] = await Promise.all([
    resolveTxtJoined(domain),
    resolveTxtJoined(`_dmarc.${domain}`),
    dkimSelector ? resolveTxtJoined(`${dkimSelector}._domainkey.${domain}`) : Promise.resolve([]),
  ])

  const spfRecord = domainTxt.find(r => /^v=spf1\b/i.test(r.trim()))
  const dmarcRecord = dmarcTxt.find(r => /^v=DMARC1\b/i.test(r.trim()))
  const dmarcPolicy = dmarcRecord?.match(/\bp=(none|quarantine|reject)/i)?.[1]?.toLowerCase()

  const result: DnsAuthResult = {
    domain,
    spf: { found: Boolean(spfRecord), record: spfRecord },
    dmarc: { found: Boolean(dmarcRecord), policy: dmarcPolicy, record: dmarcRecord },
  }
  if (dkimSelector) {
    result.dkim = {
      found: dkimTxt.some(r => /\bp=[A-Za-z0-9+/=]/.test(r)),
      selector: dkimSelector,
    }
  }

  cache.set(cacheKey, { at: Date.now(), result })
  return result
}
