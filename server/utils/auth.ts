import { randomBytes, createHmac, timingSafeEqual } from 'crypto'
import { sqlite } from '~/server/db/index'
import { db } from '~/server/db/index'
import { sessions } from '~/server/db/schema'
import { eq, lt } from 'drizzle-orm'

const MAX_ATTEMPTS = 10
const BLOCK_DURATION = 15 * 60 // seconds
const WINDOW = 15 * 60 // seconds
const SESSION_TTL = 24 * 60 * 60 * 1000

// ─── IP helpers ────────────────────────────────────────────────────────────────

export function getClientIp(event: Parameters<typeof import('h3').getHeader>[0]): string {
  const forwarded = getHeader(event, 'x-forwarded-for')
  const realIp = getHeader(event, 'x-real-ip')
  // @ts-ignore
  const socketIp = event.node?.req?.socket?.remoteAddress
  return forwarded?.split(',')[0]?.trim() ?? realIp ?? socketIp ?? 'unknown'
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

// ─── HMAC tokens ───────────────────────────────────────────────────────────────

export function signUnsubscribeToken(sendId: number, secret: string): string {
  return createHmac('sha256', secret).update(`unsub:${sendId}`).digest('hex')
}

export function verifyUnsubscribeToken(sendId: number, token: string, secret: string): boolean {
  try {
    const expected = signUnsubscribeToken(sendId, secret)
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(token, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function signClickToken(sendId: number, url: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`click:${sendId}:${url}`)
    .digest('hex') // full 64-char hex — no truncation
}

export function verifyClickToken(sendId: number, url: string, token: string, secret: string): boolean {
  try {
    const expected = signClickToken(sendId, url, secret)
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(token, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function signOpenToken(sendId: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`open:${sendId}`)
    .digest('hex')
}

export function verifyOpenToken(sendId: number, token: string, secret: string): boolean {
  try {
    const expected = signOpenToken(sendId, secret)
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(token, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function signResubscribeToken(sendId: number, secret: string): string {
  return createHmac('sha256', secret).update(`resub:${sendId}`).digest('hex')
}

export function verifyResubscribeToken(sendId: number, token: string, secret: string): boolean {
  try {
    const expected = signResubscribeToken(sendId, secret)
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(token, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
