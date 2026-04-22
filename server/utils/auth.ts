import { randomBytes } from 'crypto'

const MAX_ATTEMPTS = 10
const BLOCK_DURATION = 15 * 60 * 1000
const WINDOW = 15 * 60 * 1000
const SESSION_TTL = 24 * 60 * 60 * 1000

interface AttemptRecord {
  count: number
  firstAttempt: number
  blockedUntil?: number
}

interface Session {
  createdAt: number
  ip: string
}

const attempts = new Map<string, AttemptRecord>()
const sessions = new Map<string, Session>()

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

export function createSession(ip: string): string {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, { createdAt: Date.now(), ip })
  cleanupSessions()
  return token
}

export function validateSession(token: string): boolean {
  const session = sessions.get(token)
  if (!session) return false
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token)
    return false
  }
  return true
}

export function destroySession(token: string): void {
  sessions.delete(token)
}

function cleanupSessions(): void {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) sessions.delete(token)
  }
}
