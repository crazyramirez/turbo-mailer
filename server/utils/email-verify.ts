import { isValidEmail } from '~/server/utils/validate'
import { resolveMxSafe, DnsUnknownError } from '~/server/utils/dns-deep'
import { promises as dns } from 'node:dns'

// Address verification without talking SMTP to the recipient's server
// (RCPT probing gets senders blocklisted and is unreliable with catch-alls).
//
//   invalid  syntax error, domain doesn't exist, or null MX ("accepts no mail")
//   risky    disposable provider, role account, suspected typo
//   valid    everything else
//
// DNS failures that are not authoritative never mark an address invalid.

export interface VerificationResult {
  status: 'valid' | 'risky' | 'invalid'
  reasons: string[]
  suggestion?: string
  checkedAt: string
}

// Most-used disposable / throwaway providers (curated; extend in settings)
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com', 'grr.la',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'trashmail.com', 'trashmail.de', 'throwawaymail.com',
  'getnada.com', 'nada.email', 'maildrop.cc', 'dispostable.com', 'mailnesia.com', 'mintemail.com',
  'fakeinbox.com', 'spamgourmet.com', 'mailcatch.com', 'moakt.com', 'emailondeck.com', 'tempinbox.com',
  'burnermail.io', 'mytemp.email', 'tempail.com', 'mohmal.com', 'dropmail.me', 'emailfake.com',
  'tempr.email', 'discard.email', 'spambox.us', 'mailpoof.com', 'inboxkitten.com', 'mail.tm',
  'minuteinbox.com', 'luxusmail.org', 'fexpost.com', 'mailsac.com', 'harakirimail.com', 'anonaddy.me',
  'jetable.org', 'mailforspam.com', 'spam4.me', 'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'linshiyouxiang.net',
  'emltmp.com', 'correotemporal.org', 'mailtemporal.es', 'crazymailing.com', 'wegwerfmail.de', 'einrot.com',
  '33mail.com', 'mvrht.net', 'owlymail.com', 'boun.cr', 'fakemail.net', 'mailnull.com', 'spamex.com',
])

const ROLE_LOCALS = new Set([
  'admin', 'administrator', 'postmaster', 'hostmaster', 'webmaster', 'abuse', 'noc', 'security',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'root', 'sysadmin',
  'info', 'contact', 'contacto', 'sales', 'ventas', 'support', 'soporte', 'help', 'ayuda', 'office',
  'hello', 'hola', 'team', 'equipo', 'billing', 'facturacion', 'marketing', 'rrhh', 'hr', 'jobs', 'empleo',
  'privacy', 'legal', 'compliance', 'list', 'listserv', 'newsletter', 'news', 'all', 'everyone',
])

const POPULAR = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com',
  'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com',
  'gmx.es', 'msn.com', 'telefonica.net', 'movistar.es', 'orange.es', 'vodafone.es', 'yandex.com', 'zoho.com',
]

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

export function suggestDomain(domain: string): string | null {
  const d = domain.toLowerCase()
  if (POPULAR.includes(d)) return null
  let best: string | null = null
  let bestDist = 3
  for (const p of POPULAR) {
    const dist = levenshtein(d, p)
    if (dist < bestDist && dist > 0) { best = p; bestDist = dist }
  }
  // Common TLD slips: gmail.con, hotmail.co
  if (!best) {
    const m = d.match(/^(gmail|hotmail|yahoo|outlook|icloud|live)\.(con|cmo|co|om|cm|comm|coom|es\.com)$/)
    if (m) best = `${m[1]}.com`
  }
  return best
}

/** Offline checks only (no DNS): syntax, disposable, role, typo. */
export function quickVerify(email: string): VerificationResult {
  const reasons: string[] = []
  const e = String(email ?? '').trim().toLowerCase()
  const checkedAt = new Date().toISOString()
  if (!isValidEmail(e)) return { status: 'invalid', reasons: ['syntax'], checkedAt }
  const [local, domain] = e.split('@')
  if (/\.\.|^\.|\.$/.test(local)) return { status: 'invalid', reasons: ['syntax'], checkedAt }
  if (!/\.[a-z]{2,}$/i.test(domain)) return { status: 'invalid', reasons: ['no_tld'], checkedAt }
  if (DISPOSABLE.has(domain)) reasons.push('disposable')
  if (ROLE_LOCALS.has(local.split('+')[0])) reasons.push('role')
  const suggestion = suggestDomain(domain)
  if (suggestion) reasons.push('typo')
  return { status: reasons.length ? 'risky' : 'valid', reasons, suggestion: suggestion ? `${local}@${suggestion}` : undefined, checkedAt }
}

const domainCache = new Map<string, { at: number; state: 'ok' | 'no_mail' | 'no_domain' | 'unknown' }>()

async function domainState(domain: string): Promise<'ok' | 'no_mail' | 'no_domain' | 'unknown'> {
  const hit = domainCache.get(domain)
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.state
  let state: 'ok' | 'no_mail' | 'no_domain' | 'unknown'
  try {
    const mx = await resolveMxSafe(domain)
    if (mx.length === 1 && (mx[0].exchange === '' || mx[0].exchange === '.')) state = 'no_mail' // RFC 7505 null MX
    else if (mx.length) state = 'ok'
    else {
      // No MX: mail falls back to the A/AAAA record (RFC 5321 §5.1)
      try {
        const a = await dns.resolve4(domain).catch(async () => dns.resolve6(domain))
        state = a.length ? 'ok' : 'no_domain'
      } catch (err: any) {
        state = ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(err?.code) ? 'no_domain' : 'unknown'
      }
    }
  } catch (err) {
    state = err instanceof DnsUnknownError ? 'unknown' : 'unknown'
  }
  domainCache.set(domain, { at: Date.now(), state })
  return state
}

export async function verifyEmail(email: string): Promise<VerificationResult> {
  const quick = quickVerify(email)
  if (quick.status === 'invalid') return quick
  const domain = email.trim().toLowerCase().split('@')[1]
  const state = await domainState(domain)
  if (state === 'no_domain') return { ...quick, status: 'invalid', reasons: [...quick.reasons, 'no_domain'] }
  if (state === 'no_mail') return { ...quick, status: 'invalid', reasons: [...quick.reasons, 'null_mx'] }
  if (state === 'unknown') return { ...quick, reasons: [...quick.reasons, 'dns_unknown'] }
  return quick
}

/** Verifies many addresses with bounded DNS concurrency. */
export async function verifyMany(emails: string[], concurrency = 8, onProgress?: (done: number) => void): Promise<Map<string, VerificationResult>> {
  const out = new Map<string, VerificationResult>()
  let i = 0
  let done = 0
  const worker = async () => {
    while (i < emails.length) {
      const e = emails[i++]
      out.set(e, await verifyEmail(e))
      done++
      if (onProgress && done % 50 === 0) onProgress(done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, worker))
  onProgress?.(done)
  return out
}
