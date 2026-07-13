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

async function resolveTxtJoined(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name)
    // TXT answers arrive split into 255-byte chunks — join each record back
    return records.map(chunks => chunks.join(''))
  } catch {
    return []
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
