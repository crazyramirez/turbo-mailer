import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Generates a CSRF token tied to the session token.
 * Format: "nonce.sig" where sig = HMAC-SHA256(sessionToken:nonce, secret)
 */
export function generateCsrfToken(sessionToken: string, secret: string): string {
  const nonce = randomBytes(16).toString('hex')
  const sig = createHmac('sha256', secret).update(`${sessionToken}:${nonce}`).digest('hex')
  return `${nonce}.${sig}`
}

/**
 * Verifies a CSRF token against the current session token.
 */
export function verifyCsrfToken(token: string, sessionToken: string, secret: string): boolean {
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return false
    const nonce = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    if (!nonce || !sig) return false
    const expected = createHmac('sha256', secret).update(`${sessionToken}:${nonce}`).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
