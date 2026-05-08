import { randomBytes, createHmac, createHash, timingSafeEqual } from 'crypto'
import { sqlite } from '~/server/db/index'
import { db } from '~/server/db/index'
import { sessions } from '~/server/db/schema'
import { eq, lt } from 'drizzle-orm'

const MAX_ATTEMPTS = 10
const BLOCK_DURATION = 15 * 60 // seconds
const WINDOW = 15 * 60 // seconds
const SESSION_TTL = 24 * 60 * 60 * 1000

// ─── IP helpers ────────────────────────────────────────────────────────────────

// B4: Only trust forwarded headers if the connecting socket is a known private/loopback range
const TRUSTED_PROXY_RE = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
]

function isTrustedProxy(socketIp: string): boolean {
  return TRUSTED_PROXY_RE.some(r => r.test(socketIp))
}

export function getClientIp(event: Parameters<typeof import('h3').getHeader>[0]): string {
  // @ts-ignore
  const socketIp: string = event.node?.req?.socket?.remoteAddress ?? ''
  if (isTrustedProxy(socketIp)) {
    const forwarded = getHeader(event, 'x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const realIp = getHeader(event, 'x-real-ip')
    if (realIp) return realIp.trim()
  }
  return socketIp || 'unknown'
}

// ─── Rate limiting (SQLite-backed, survives restarts) ──────────────────────────

interface RateLimitResult {
  blocked: boolean
  remaining: number
  retryAfterSec?: number
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Math.floor(Date.now() / 1000)
  const row = sqlite
    .prepare('SELECT count, first_attempt, blocked_until FROM login_attempts WHERE ip = ?')
    .get(ip) as { count: number; first_attempt: number; blocked_until: number | null } | undefined

  if (!row) return { blocked: false, remaining: MAX_ATTEMPTS }

  if (row.blocked_until && now < row.blocked_until) {
    return { blocked: true, remaining: 0, retryAfterSec: row.blocked_until - now }
  }

  if (now - row.first_attempt > WINDOW) {
    sqlite.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip)
    return { blocked: false, remaining: MAX_ATTEMPTS }
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - row.count }
}

export function recordFailedAttempt(ip: string): RateLimitResult {
  const now = Math.floor(Date.now() / 1000)
  const existing = sqlite
    .prepare('SELECT count, first_attempt FROM login_attempts WHERE ip = ?')
    .get(ip) as { count: number; first_attempt: number } | undefined

  let count: number
  let firstAttempt: number

  if (!existing || now - existing.first_attempt > WINDOW) {
    count = 1
    firstAttempt = now
    sqlite.prepare(
      'INSERT OR REPLACE INTO login_attempts (ip, count, first_attempt, blocked_until) VALUES (?, ?, ?, NULL)'
    ).run(ip, count, firstAttempt)
  } else {
    count = existing.count + 1
    firstAttempt = existing.first_attempt
    const blockedUntil = count >= MAX_ATTEMPTS ? now + BLOCK_DURATION : null
    sqlite.prepare(
      'UPDATE login_attempts SET count = ?, blocked_until = ? WHERE ip = ?'
    ).run(count, blockedUntil, ip)

    if (count >= MAX_ATTEMPTS) {
      return { blocked: true, remaining: 0, retryAfterSec: BLOCK_DURATION }
    }
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - count }
}

export function clearAttempts(ip: string): void {
  sqlite.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip)
}

// ─── Sessions (SQLite-backed, survives restarts) ───────────────────────────────

export async function createSession(ip: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL)
  await db.insert(sessions).values({ token, ip, createdAt: now, expiresAt })
  await db.delete(sessions).where(lt(sessions.expiresAt, now)).catch(() => {})
  return token
}

export async function validateSession(token: string): Promise<boolean> {
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token))
  if (!session) return false
  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.token, token)).catch(() => {})
    return false
  }
  return true
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token))
}

// ─── API Key verification ───────────────────────────────────────────────────────

/**
 * Hashes an API key with SHA-256 for storage. Prefix "sha256:" marks hashed values.
 */
export function hashApiKey(key: string): string {
  return `sha256:${createHash('sha256').update(key).digest('hex')}`
}

/**
 * Timing-safe API key verification.
 * Supports both hashed ("sha256:...") and legacy plaintext stored values.
 */
export function verifyApiKey(incoming: string, stored: string): boolean {
  try {
    if (stored.startsWith('sha256:')) {
      const incomingHash = `sha256:${createHash('sha256').update(incoming).digest('hex')}`
      const a = Buffer.from(incomingHash)
      const b = Buffer.from(stored)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    }
    // Legacy plaintext: timing-safe comparison
    const a = Buffer.from(incoming)
    const b = Buffer.from(stored)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ─── HMAC tokens ───────────────────────────────────────────────────────────────

// B2: Derive a purpose-specific sub-key from the master secret.
// Prevents cross-operation token forgery even if one purpose is compromised.
function deriveSecret(master: string, purpose: string): string {
  return createHmac('sha256', master).update(`purpose:${purpose}`).digest('hex')
}

const DEFAULT_TOKEN_TTL_DAYS = 30

// B3: Timestamp-based token format: "ts.sig"
// Legacy format (no dot, 64-char hex) is accepted during migration period.
function signTimestamped(payload: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', secret).update(`${payload}:${ts}`).digest('hex')
  return `${ts}.${sig}`
}

function verifyTimestamped(
  payload: string,
  token: string,
  secret: string,
  ttlDays: number,
): boolean {
  const dot = token.indexOf('.')
  // Legacy token (no dot): verify with old format for backwards compatibility
  if (dot === -1) {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    try {
      const a = Buffer.from(expected, 'hex')
      const b = Buffer.from(token, 'hex')
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch { return false }
  }
  // New format: "ts.sig"
  const ts = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!ts || !sig) return false
  const ageSec = Math.floor(Date.now() / 1000) - ts
  if (ageSec > ttlDays * 86400) return false
  const expected = createHmac('sha256', secret).update(`${payload}:${ts}`).digest('hex')
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch { return false }
}

export function signUnsubscribeToken(sendId: number, secret: string): string {
  return signTimestamped(`unsub:${sendId}`, deriveSecret(secret, 'unsub'))
}

export function verifyUnsubscribeToken(sendId: number, token: string, secret: string): boolean {
  return verifyTimestamped(`unsub:${sendId}`, token, deriveSecret(secret, 'unsub'), DEFAULT_TOKEN_TTL_DAYS)
}

export function signClickToken(sendId: number, url: string, secret: string): string {
  return signTimestamped(`click:${sendId}:${url}`, deriveSecret(secret, 'click'))
}

export function verifyClickToken(sendId: number, url: string, token: string, secret: string): boolean {
  return verifyTimestamped(`click:${sendId}:${url}`, token, deriveSecret(secret, 'click'), DEFAULT_TOKEN_TTL_DAYS)
}

export function signOpenToken(sendId: number, secret: string): string {
  return signTimestamped(`open:${sendId}`, deriveSecret(secret, 'open'))
}

export function verifyOpenToken(sendId: number, token: string, secret: string): boolean {
  return verifyTimestamped(`open:${sendId}`, token, deriveSecret(secret, 'open'), DEFAULT_TOKEN_TTL_DAYS)
}

export function signResubscribeToken(sendId: number, secret: string): string {
  return signTimestamped(`resub:${sendId}`, deriveSecret(secret, 'resub'))
}

export function verifyResubscribeToken(sendId: number, token: string, secret: string): boolean {
  return verifyTimestamped(`resub:${sendId}`, token, deriveSecret(secret, 'resub'), DEFAULT_TOKEN_TTL_DAYS)
}
