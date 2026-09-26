// Classifies an SMTP failure by WHO is at fault, because each case needs a
// different reaction:
//
//   connection  our SMTP server unreachable / TLS / DNS / timeout   → retry, fail over, pause
//   auth        our SMTP credentials rejected                      → fail over, pause
//   rate_limit  our provider (or the receiver) throttling us        → slow down, requeue
//   soft        transient recipient problem (full, greylisted)      → requeue with backoff
//   hard        the address does not exist / is disabled           → bounce + suppress contact
//   block       policy/reputation/content/authentication rejection → NOT the address' fault:
//               never bounce the contact; feeds the circuit breaker
//
// The old pipeline treated every 5xx as a hard bounce: a single Gmail
// "550 5.7.26 unauthenticated" (DMARC) rejection marked perfectly valid Gmail
// addresses as bounced forever, and an SMTP outage slowly flipped the whole
// list to 'inactive'. This module exists so that never happens again.

export type SmtpFailureClass = 'connection' | 'auth' | 'rate_limit' | 'soft' | 'hard' | 'block'

export interface SmtpFailure {
  kind: SmtpFailureClass
  responseCode: number | null
  enhanced: string | null
  message: string
}

const CONNECTION_CODES = new Set([
  'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND',
  'ECONNRESET', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ETLS', 'EPROTOCOL',
  'EAI_AGAIN', 'ECLOSE',
])

// "The mailbox does not exist" family
const ADDRESS_RE = /user unknown|unknown user|no such user|user not found|does not exist|doesn'?t exist|no such (?:mailbox|recipient|address)|mailbox (?:unavailable|not found|disabled|inactive)|recipient (?:not found|unknown|address rejected)|invalid (?:recipient|mailbox|address)|address rejected|account (?:has been )?disabled|account is inactive|unrouteable address|no mailbox|mailbox is disabled|not a valid mailbox/i

// "We refuse YOUR mail" family — reputation, spam filters, authentication
const POLICY_RE = /spam|blocked|block ?list|blacklist|reputation|policy|dmarc|\bspf\b|dkim|unauthenticated|not authenticated|authentication (?:required|failed)|content|abuse|listed|\bRBL\b|spamhaus|barracuda|junk|phish|virus|malware|rejected for policy|message rejected|poor sender|suspicious|low reputation|prohibited/i

const RATE_RE = /\brate\b|rate limit|too many|too quickly|throttl|limit exceeded|exceeded .*limit|slow down|sending quota|daily (?:sending )?quota|message limit/i

// Greylisting and generic deferrals: retry this recipient later, no global slow-down
const GREYLIST_RE = /gr[ea]y ?list|try again later|come back later|temporarily (?:rejected|deferred)|deferred/i

function extractEnhanced(text: string): string | null {
  const m = text.match(/\b([245])\.(\d{1,3})\.(\d{1,3})\b/)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

export function classifySmtpError(err: unknown): SmtpFailure {
  const e = (err ?? {}) as any
  const message = String(e.response || e.message || err || '').slice(0, 500)
  const code = String(e.code || '')
  const command = String(e.command || '').toUpperCase()
  let responseCode: number | null = Number(e.responseCode) || null
  if (!responseCode) {
    const m = message.match(/^\s*([245]\d\d)[\s-]/)
    if (m) responseCode = Number(m[1])
  }
  const enhanced = extractEnhanced(message)
  const result = (kind: SmtpFailureClass): SmtpFailure => ({ kind, responseCode, enhanced, message })

  // Our credentials
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534 || responseCode === 530 || command.startsWith('AUTH')) {
    return result('auth')
  }

  // No SMTP reply at all → the conversation with OUR server broke
  if (!responseCode) {
    if (CONNECTION_CODES.has(code) || /timeout|timed out|connection (?:closed|refused|reset)|socket|getaddrinfo|certificate|tls/i.test(message)) {
      return result('connection')
    }
    // Unknown local failure: be conservative — never blame the recipient
    return result('connection')
  }

  // 421 = "service not available, closing channel" — almost always throttling
  if (responseCode === 421) return result('rate_limit')

  // MAIL FROM rejected = our sender address/domain is the problem
  if (command === 'MAIL FROM') {
    return responseCode >= 500 ? result('block') : result('rate_limit')
  }

  if (responseCode >= 400 && responseCode < 500) {
    // 4.7.28 = Gmail "unusual rate of unsolicited mail"
    if (enhanced === '4.7.28') return result('rate_limit')
    if (GREYLIST_RE.test(message)) return result('soft')
    if (RATE_RE.test(message)) return result('rate_limit')
    return result('soft')
  }

  if (responseCode >= 500 && responseCode < 600) {
    if (enhanced) {
      const [, subject, detail] = enhanced.split('.').map(Number)
      // 5.1.7 / 5.1.8 are about the SENDER address, not the recipient
      if (subject === 1 && (detail === 7 || detail === 8)) return result('block')
      if (subject === 1) return result('hard')
      if (subject === 2) {
        if (detail === 2) return result('soft') // mailbox full
        if (detail === 3) return result('block') // message too big — our content
        return result('hard') // 5.2.1 disabled, 5.2.0 other mailbox status
      }
      if (subject === 4) {
        // 5.4.x routing: 5.4.1 is Microsoft's "recipient not in directory",
        // unless the text says it is a policy block
        return POLICY_RE.test(message) ? result('block') : result('hard')
      }
      if (subject === 7) {
        // Security/policy. Some servers wrongly use 5.7.1 for unknown users;
        // only an unambiguous address message without policy wording counts.
        if (ADDRESS_RE.test(message) && !POLICY_RE.test(message)) return result('hard')
        if (RATE_RE.test(message)) return result('rate_limit')
        return result('block')
      }
      if (subject === 3 || subject === 5 || subject === 6) return result('block')
    }

    // No enhanced code: decide on the text, policy wording first
    if (POLICY_RE.test(message)) return result('block')
    if (ADDRESS_RE.test(message)) return result('hard')
    if (RATE_RE.test(message)) return result('rate_limit')
    if (responseCode === 552) return result('soft')
    if (responseCode === 554) return result('block')
    // A bare 550/551/553 on RCPT is the classic "no such user"
    if ((responseCode === 550 || responseCode === 551 || responseCode === 553) && (command.startsWith('RCPT') || !command)) {
      return result('hard')
    }
    return result('block')
  }

  return result('soft')
}

/** Short Spanish explanation stored with the send — what the user sees. */
export function describeFailure(f: SmtpFailure): string {
  const code = [f.responseCode, f.enhanced].filter(Boolean).join(' ')
  const tail = f.message ? ` — ${f.message.replace(/\s+/g, ' ').slice(0, 180)}` : ''
  switch (f.kind) {
    case 'hard': return `Dirección inexistente o desactivada (${code})${tail}`
    case 'soft': return `Fallo temporal del destinatario (${code || 'sin código'})${tail}`
    case 'block': return `Rechazado por política/reputación del servidor receptor, no por la dirección (${code})${tail}`
    case 'rate_limit': return `Límite de velocidad del proveedor (${code || 'sin código'})${tail}`
    case 'auth': return `Credenciales SMTP rechazadas${tail}`
    case 'connection': return `No se pudo conectar con el servidor SMTP${tail}`
  }
}
