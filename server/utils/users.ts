import bcrypt from 'bcryptjs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { sqlite } from '~/server/db/index'
import { encryptField, decryptField } from '~/server/utils/encryption'
import { verifyTotp } from '~/server/utils/totp'

// Team accounts. While the users table is empty the app runs in legacy
// single-password mode and every session acts as the owner. The first user
// (always an owner) switches login to email + password (+ 2FA).

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'
export const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer']
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }

export const MIN_PASSWORD_LENGTH = 10
const BCRYPT_COST = 12
// Hash compared against when the email doesn't exist, so a miss costs the
// same time as a wrong password (no account enumeration by timing)
let _dummyHash: string | null = null
function dummyHash(): string {
  return (_dummyHash ??= bcrypt.hashSync('turbomailer-dummy-password', BCRYPT_COST))
}

export interface AuthContext {
  userId: number | null
  email: string | null
  name: string | null
  role: Role
}

export interface UserRow {
  id: number
  email: string
  name: string | null
  password_hash: string
  role: Role
  totp_secret: string | null
  totp_enabled: number
  totp_last_step: number | null
  recovery_codes: string | null
  disabled: number
  last_login_at: number | null
  created_at: number | null
}

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min]
}

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as string[]).includes(v)
}

export function multiUserEnabled(): boolean {
  return !!sqlite.prepare('SELECT 1 FROM users LIMIT 1').get()
}

export function getUser(id: number): UserRow | undefined {
  return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function getUserByEmail(email: string): UserRow | undefined {
  return sqlite.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim()) as UserRow | undefined
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    totpEnabled: !!u.totp_enabled,
    disabled: !!u.disabled,
    lastLoginAt: u.last_login_at ? new Date(u.last_login_at * 1000).toISOString() : null,
    createdAt: u.created_at ? new Date(u.created_at * 1000).toISOString() : null,
    recoveryCodesLeft: u.recovery_codes ? (JSON.parse(u.recovery_codes) as string[]).length : 0,
  }
}

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, BCRYPT_COST)
}

export function checkPassword(pw: string, hash: string | null | undefined): boolean {
  try {
    return bcrypt.compareSync(pw, hash || dummyHash()) && !!hash
  } catch {
    return false
  }
}

/** Single-password installs: bcrypt hash from the wizard or a legacy plaintext value. */
export function checkLegacyPassword(input: string, expected: string | undefined): boolean {
  if (!expected) return false
  if (/^\$2[aby]\$/.test(expected)) {
    try {
      return bcrypt.compareSync(input, expected)
    } catch {
      return false
    }
  }
  const a = Buffer.alloc(256)
  const b = Buffer.alloc(256)
  Buffer.from(input).copy(a, 0, 0, Math.min(input.length, 256))
  Buffer.from(expected).copy(b, 0, 0, Math.min(expected.length, 256))
  return timingSafeEqual(a, b) && input.length === expected.length
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return s && s.length <= 254 && EMAIL_RE.test(s) ? s : null
}

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
  if (pw.length > 200) return 'Contraseña demasiado larga'
  return null
}

export function countOwners(excludeId?: number): number {
  const row = sqlite.prepare(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND disabled = 0 ${excludeId ? 'AND id != ?' : ''}`,
  ).get(...(excludeId ? [excludeId] : [])) as { n: number }
  return row.n
}

/** Kills every session and refresh token of a user (disable, password reset, delete). */
export function revokeUserSessions(userId: number, keepToken?: string): void {
  if (keepToken) sqlite.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken)
  else sqlite.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  sqlite.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId)
}

// ── Session → user ────────────────────────────────────────────────────────

/**
 * Resolves the session cookie to an auth context, or null when the session
 * is missing, expired, belongs to a disabled user, or is a legacy
 * (user-less) session after team accounts were enabled.
 */
export function resolveSession(token: string | undefined): AuthContext | null {
  if (!token) return null
  const row = sqlite.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as
    { user_id: number | null; expires_at: number } | undefined
  if (!row) return null
  // Drizzle stores timestamp columns in seconds
  if (row.expires_at * 1000 < Date.now()) {
    sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  if (row.user_id === null) {
    if (multiUserEnabled()) return null
    return { userId: null, email: null, name: null, role: 'owner' }
  }
  const user = getUser(row.user_id)
  if (!user || user.disabled) return null
  return { userId: user.id, email: user.email, name: user.name, role: user.role }
}

/** Auth context set by the auth middleware (owner for internal calls). */
export function authOf(event: H3Event): AuthContext {
  return (event.context.auth as AuthContext | undefined) ?? { userId: null, email: null, name: null, role: 'owner' }
}

export function requireRole(event: H3Event, min: Role): AuthContext {
  const auth = authOf(event)
  if (!roleAtLeast(auth.role, min)) throw createError({ statusCode: 403, statusMessage: 'No tienes permisos para esta acción' })
  return auth
}

/**
 * Minimum role for an API route. Reads are open to every role; writes need
 * an editor; configuration, team and destructive maintenance need an admin.
 */
const ADMIN_PREFIXES = [
  '/api/settings',
  '/api/users',
  '/api/reset',
  '/api/demo-load',
  '/api/audit-log',
]
// POSTs that only read data
const READ_ONLY_POSTS = ['/api/segments/preview']

export function requiredRoleFor(path: string, method: string): Role {
  if (path.startsWith('/api/auth/') || path === '/api/me' || path.startsWith('/api/me/')) return 'viewer'
  if (ADMIN_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))) return 'admin'
  if (path.startsWith('/api/brand-kit') && method !== 'GET') return 'admin'
  if (method === 'GET' || method === 'HEAD') return 'viewer'
  if (READ_ONLY_POSTS.some(p => path.startsWith(p))) return 'viewer'
  return 'editor'
}

// ── 2FA ───────────────────────────────────────────────────────────────────

function hashRecovery(code: string): string {
  return createHash('sha256').update(code.replace(/[^a-z0-9]/gi, '').toLowerCase()).digest('hex')
}

/** 10 one-time codes "xxxxx-xxxxx"; only their hashes are stored. */
export function generateRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 10 }, () => {
    const raw = randomBytes(6).toString('hex').slice(0, 10)
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
  return { codes, hashes: codes.map(hashRecovery) }
}

export function totpSecretOf(user: UserRow): string | null {
  return user.totp_secret ? decryptField(user.totp_secret) : null
}

export function storeTotpSecret(userId: number, secret: string): void {
  sqlite.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0, totp_last_step = NULL WHERE id = ?')
    .run(encryptField(secret), userId)
}

/**
 * Verifies a second factor: a 6-digit TOTP (not replayable) or an unused
 * recovery code (consumed on success).
 */
export function verifySecondFactor(user: UserRow, code: string): boolean {
  const clean = String(code ?? '').trim()
  if (!clean) return false
  const secret = totpSecretOf(user)
  if (/^\d{6}$/.test(clean.replace(/\s/g, ''))) {
    if (!secret) return false
    const step = verifyTotp(secret, clean, user.totp_last_step)
    if (step === null) return false
    sqlite.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id)
    return true
  }
  const hashes: string[] = user.recovery_codes ? JSON.parse(user.recovery_codes) : []
  const h = Buffer.from(hashRecovery(clean))
  const idx = hashes.findIndex(x => timingSafeEqual(Buffer.from(x), h))
  if (idx === -1) return false
  hashes.splice(idx, 1)
  sqlite.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(hashes), user.id)
  return true
}
