import { randomBytes, createHmac, timingSafeEqual } from 'crypto'
import { db } from '~/server/db/index'
import { sessions } from '~/server/db/schema'
import { eq, lt } from 'drizzle-orm'

const MAX_ATTEMPTS = 10
const BLOCK_DURATION = 15 * 60 * 1000
const WINDOW = 15 * 60 * 1000
const SESSION_TTL = 24 * 60 * 60 * 1000

interface AttemptRecord {
  count: number
  firstAttempt: number
  blockedUntil?: number
}

const attempts = new Map<string, AttemptRecord>()

export function getClientIp(event: Parameters<typeof import('h3').getHeader>[0]): string {
  const forwarded = getHeader(event, 'x-forwarded-for')
  const realIp = getHeader(event, 'x-real-ip')
  // @ts-ignore
  const socketIp = event.node?.req?.socket?.remoteAddress
  return forwarded?.split(',')[0]?.trim() ?? realIp ?? socketIp ?? 'unknown'
}

export function checkRateLimit(ip: string): { blocked: boolean; remaining: number; retryAfterSec?: number } {
  const now = Date.now()
  const record = attempts.get(ip)

  if (!record) return { blocked: false, remaining: MAX_ATTEMPTS }

  if (record.blockedUntil && now < record.blockedUntil) {
    return { blocked: true, remaining: 0, retryAfterSec: Math.ceil((record.blockedUntil - now) / 1000) }
  }

  if (now - record.firstAttempt > WINDOW) {
    attempts.delete(ip)
    return { blocked: false, remaining: MAX_ATTEMPTS }
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - record.count }
}

export function recordFailedAttempt(ip: string): { blocked: boolean; remaining: number; retryAfterSec?: number } {
  const now = Date.now()
  const record = attempts.get(ip) ?? { count: 0, firstAttempt: now }

  if (now - record.firstAttempt > WINDOW) {
    record.count = 0
    record.firstAttempt = now
    record.blockedUntil = undefined
  }

  record.count++

  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION
    attempts.set(ip, record)
    return { blocked: true, remaining: 0, retryAfterSec: BLOCK_DURATION / 1000 }
  }

  attempts.set(ip, record)
  return { blocked: false, remaining: MAX_ATTEMPTS - record.count }
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip)
}

export async function createSession(ip: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL)
  await db.insert(sessions).values({ token, ip, createdAt: now, expiresAt })
  // Prune expired sessions on create (low-frequency cleanup)
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

export function signUnsubscribeToken(sendId: number, secret: string): string {
  return createHmac('sha256', secret).update(String(sendId)).digest('hex')
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
