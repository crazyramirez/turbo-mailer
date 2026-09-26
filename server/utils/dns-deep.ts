import { promises as dns } from 'node:dns'
import { resolveTxtJoined } from '~/server/utils/dns-check'

// Deeper sender-domain diagnostics than "does the record exist":
//
//  - SPF with more than 10 DNS lookups is a PERMERROR — receivers treat it as
//    if there were no SPF at all. Very common after adding a few ESP includes.
//  - DMARC policy strength / reporting, DKIM key size (1024 is weak).
//  - MX for the From domain (replies and some receivers' sanity checks).
//  - BIMI, MTA-STS, TLS-RPT: optional, informative.
//
// Every lookup failure that is not an authoritative "no record" is reported
// as unknown — never as a problem the user doesn't have.

const NO_RECORD = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN'])

export class DnsUnknownError extends Error {}

async function resolveMxViaDoH(name: string): Promise<{ exchange: string; priority: number }[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=MX`, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new DnsUnknownError(`DoH ${res.status}`)
  const json = await res.json() as { Status: number; Answer?: { type: number; data: string }[] }
  if (json.Status === 3) return []
  return (json.Answer ?? []).filter(a => a.type === 15).map(a => {
    const [prio, host] = a.data.split(/\s+/)
    return { priority: Number(prio), exchange: (host ?? '').replace(/\.$/, '') }
  })
}

export async function resolveMxSafe(domain: string): Promise<{ exchange: string; priority: number }[]> {
  try {
    return await dns.resolveMx(domain)
  } catch (err: any) {
    if (NO_RECORD.has(err?.code)) return []
    try {
      return await resolveMxViaDoH(domain)
    } catch {
      throw new DnsUnknownError(`MX lookup unavailable for ${domain}`)
    }
  }
}

async function txtSafe(name: string): Promise<string[] | null> {
  try {
    return await resolveTxtJoined(name)
  } catch {
    return null // unknown
  }
}

export interface SpfAnalysis {
  record: string | null
  lookups: number
  tooMany: boolean
  multipleRecords: boolean
  allQualifier: string | null
  unknown: boolean
}

/** Counts DNS-querying mechanisms (include, a, mx, ptr, exists, redirect) recursively. */
export async function analyzeSpf(domain: string): Promise<SpfAnalysis> {
  const root = await txtSafe(domain)
  if (root === null) return { record: null, lookups: 0, tooMany: false, multipleRecords: false, allQualifier: null, unknown: true }
  const spfs = root.filter(r => /^v=spf1\b/i.test(r.trim()))
  const record = spfs[0] ?? null
  let lookups = 0
  let unknown = false
  const seen = new Set<string>()

  async function walk(rec: string, depth: number) {
    if (depth > 10) return
    const terms = rec.trim().split(/\s+/).slice(1)
    for (const term of terms) {
      const t = term.replace(/^[+\-~?]/, '').toLowerCase()
      if (t.startsWith('include:') || t.startsWith('redirect=')) {
        lookups++
        const target = t.split(/[:=]/)[1]
        if (!target || seen.has(target)) continue
        seen.add(target)
        const txt = await txtSafe(target)
        if (txt === null) { unknown = true; continue }
        const inner = txt.find(r => /^v=spf1\b/i.test(r.trim()))
        if (inner) await walk(inner, depth + 1)
      } else if (t === 'a' || t.startsWith('a:') || t.startsWith('a/') || t === 'mx' || t.startsWith('mx:') || t.startsWith('mx/') || t === 'ptr' || t.startsWith('ptr:') || t.startsWith('exists:')) {
        lookups++
      }
    }
  }
  if (record) await walk(record, 0)
  const allQualifier = record?.match(/\s([+\-~?]?)all\b/i)?.[1] ?? (record && /\sall\b/i.test(record) ? '+' : null)
  return { record, lookups, tooMany: lookups > 10, multipleRecords: spfs.length > 1, allQualifier: allQualifier === '' ? '+' : allQualifier, unknown }
}

export interface DmarcDetails {
  record: string | null
  policy: 'none' | 'quarantine' | 'reject' | null
  pct: number
  hasRua: boolean
  unknown: boolean
}

export async function analyzeDmarc(domain: string): Promise<DmarcDetails> {
  const txt = await txtSafe(`_dmarc.${domain}`)
  if (txt === null) return { record: null, policy: null, pct: 100, hasRua: false, unknown: true }
  const record = txt.find(r => /^v=DMARC1\b/i.test(r.trim())) ?? null
  const policy = (record?.match(/\bp=(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null) as DmarcDetails['policy']
  const pct = Number(record?.match(/\bpct=(\d+)/i)?.[1] ?? 100)
  return { record, policy, pct, hasRua: /\brua=/i.test(record ?? ''), unknown: false }
}

/** Approximate RSA key size from the DKIM p= tag (base64 DER SubjectPublicKeyInfo). */
export function dkimKeyBits(record: string): number | null {
  const p = record.match(/\bp=([A-Za-z0-9+/=]+)/)?.[1]
  if (!p) return null
  const bytes = Buffer.from(p, 'base64').length
  if (bytes >= 540) return 4096
  if (bytes >= 290) return 2048
  if (bytes >= 160) return 1024
  if (bytes >= 90) return 512
  return null
}

export async function analyzeDkim(domain: string, selector: string): Promise<{ found: boolean; bits: number | null; unknown: boolean }> {
  const txt = await txtSafe(`${selector}._domainkey.${domain}`)
  if (txt === null) return { found: false, bits: null, unknown: true }
  const rec = txt.find(r => /\bp=[A-Za-z0-9+/=]/.test(r))
  return { found: !!rec, bits: rec ? dkimKeyBits(rec) : null, unknown: false }
}

export async function hasTxtRecord(name: string, prefix: RegExp): Promise<boolean | null> {
  const txt = await txtSafe(name)
  if (txt === null) return null
  return txt.some(r => prefix.test(r.trim()))
}

/** Relaxed DMARC alignment between the From domain and the DKIM signing domain. */
export function relaxedAligned(fromDomain: string, dkimDomain: string | null | undefined): boolean {
  if (!dkimDomain) return false
  const a = fromDomain.toLowerCase()
  const b = dkimDomain.toLowerCase()
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

export interface DomainHealth {
  domain: string
  spf: SpfAnalysis
  dmarc: DmarcDetails
  dkim: { selector: string; found: boolean; bits: number | null; unknown: boolean } | null
  dkimAligned: boolean
  mx: { found: boolean; unknown: boolean; hosts: string[] }
  bimi: boolean | null
  mtaSts: boolean | null
  tlsRpt: boolean | null
}

const cache = new Map<string, { at: number; value: DomainHealth }>()

export async function domainHealth(domain: string, dkim?: { domain?: string; selector?: string }): Promise<DomainHealth> {
  const key = `${domain}|${dkim?.domain ?? ''}|${dkim?.selector ?? ''}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value

  const [spf, dmarc, dkimRes, mx, bimi, mtaSts, tlsRpt] = await Promise.all([
    analyzeSpf(domain),
    analyzeDmarc(domain),
    dkim?.selector ? analyzeDkim(dkim.domain || domain, dkim.selector) : Promise.resolve(null),
    resolveMxSafe(domain).then(r => ({ found: r.length > 0, unknown: false, hosts: r.map(x => x.exchange) })).catch(() => ({ found: false, unknown: true, hosts: [] as string[] })),
    hasTxtRecord(`default._bimi.${domain}`, /^v=BIMI1/i),
    hasTxtRecord(`_mta-sts.${domain}`, /^v=STSv1/i),
    hasTxtRecord(`_smtp._tls.${domain}`, /^v=TLSRPTv1/i),
  ])

  const value: DomainHealth = {
    domain,
    spf,
    dmarc,
    dkim: dkimRes ? { selector: dkim!.selector!, ...dkimRes } : null,
    dkimAligned: relaxedAligned(domain, dkim?.domain),
    mx,
    bimi,
    mtaSts,
    tlsRpt,
  }
  cache.set(key, { at: Date.now(), value })
  return value
}
