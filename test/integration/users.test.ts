import { describe, it, expect, beforeEach, vi } from 'vitest'

await vi.hoisted(async () => {
  const h = await import('./harness')
  return h.bootIsolatedEnv()
})

const { sqlite } = await import('~/server/db/index')
const totp = await import('~/server/utils/totp')
const users = await import('~/server/utils/users')

const now = () => Math.floor(Date.now() / 1000)

function addUser(email: string, role: string, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    email, name: null, password_hash: users.hashPassword('correct horse battery'), role,
    totp_enabled: 0, disabled: 0, created_at: now(), ...extra,
  }
  const cols = Object.keys(row)
  return Number(sqlite.prepare(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...(Object.values(row) as any[])).lastInsertRowid)
}
function addSession(token: string, userId: number | null, ttlSec = 3600) {
  sqlite.prepare('INSERT INTO sessions (token, ip, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(token, '127.0.0.1', userId, now(), now() + ttlSec)
}

beforeEach(() => {
  sqlite.exec('DELETE FROM sessions; DELETE FROM refresh_tokens; DELETE FROM users;')
})

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 appendix B vectors, SHA-1 secret "12345678901234567890"
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'))

  it('encodes the RFC secret in base32', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(totp.base32Decode(secret).toString()).toBe('12345678901234567890')
  })

  it('matches the reference vectors (last 6 digits)', () => {
    expect(totp.totpCode(secret, Math.floor(59 / 30))).toBe('287082')
    expect(totp.totpCode(secret, Math.floor(1111111109 / 30))).toBe('081804')
    expect(totp.totpCode(secret, Math.floor(1234567890 / 30))).toBe('005924')
    expect(totp.totpCode(secret, Math.floor(2000000000 / 30))).toBe('279037')
  })

  it('accepts ±1 step of drift and rejects replays', () => {
    const t = 1234567890 * 1000
    const step = totp.currentStep(t)
    expect(totp.verifyTotp(secret, totp.totpCode(secret, step - 1), null, t)).toBe(step - 1)
    expect(totp.verifyTotp(secret, totp.totpCode(secret, step + 1), null, t)).toBe(step + 1)
    expect(totp.verifyTotp(secret, totp.totpCode(secret, step - 2), null, t)).toBeNull()
    // Already used this step → the same code is refused
    expect(totp.verifyTotp(secret, totp.totpCode(secret, step), step, t)).toBeNull()
    expect(totp.verifyTotp(secret, 'abcdef', null, t)).toBeNull()
  })

  it('builds an otpauth URI apps understand', () => {
    const uri = totp.otpauthUri('ABC', 'ana@example.com')
    expect(uri).toMatch(/^otpauth:\/\/totp\/TurboMailer%3Aana%40example\.com\?secret=ABC&issuer=TurboMailer/)
  })
})

describe('role rules', () => {
  it('maps routes to minimum roles', () => {
    expect(users.requiredRoleFor('/api/campaigns', 'GET')).toBe('viewer')
    expect(users.requiredRoleFor('/api/campaigns/3/send', 'POST')).toBe('editor')
    expect(users.requiredRoleFor('/api/settings', 'GET')).toBe('admin')
    expect(users.requiredRoleFor('/api/settings/backups/download', 'GET')).toBe('admin')
    expect(users.requiredRoleFor('/api/users/2', 'DELETE')).toBe('admin')
    expect(users.requiredRoleFor('/api/audit-log', 'GET')).toBe('admin')
    expect(users.requiredRoleFor('/api/reset', 'DELETE')).toBe('admin')
    expect(users.requiredRoleFor('/api/brand-kit', 'GET')).toBe('viewer')
    expect(users.requiredRoleFor('/api/brand-kit', 'PUT')).toBe('admin')
    expect(users.requiredRoleFor('/api/me/2fa/setup', 'POST')).toBe('viewer')
    expect(users.requiredRoleFor('/api/auth/logout', 'POST')).toBe('viewer')
    expect(users.requiredRoleFor('/api/segments/preview', 'POST')).toBe('viewer')
    // Prefix must be a whole segment
    expect(users.requiredRoleFor('/api/settingsx', 'GET')).toBe('viewer')
    expect(users.requiredRoleFor('/api/meta', 'GET')).toBe('viewer')
    expect(users.requiredRoleFor('/api/meta', 'POST')).toBe('editor')
  })

  it('ranks roles', () => {
    expect(users.roleAtLeast('owner', 'admin')).toBe(true)
    expect(users.roleAtLeast('editor', 'admin')).toBe(false)
    expect(users.roleAtLeast('viewer', 'viewer')).toBe(true)
  })
})

describe('sessions', () => {
  it('legacy sessions act as owner until team accounts exist', () => {
    addSession('legacy', null)
    expect(users.resolveSession('legacy')).toMatchObject({ userId: null, role: 'owner' })
    addUser('owner@example.com', 'owner')
    expect(users.resolveSession('legacy')).toBeNull()
  })

  it('resolves user sessions and drops disabled users and expired sessions', () => {
    const id = addUser('ed@example.com', 'editor')
    addSession('s1', id)
    expect(users.resolveSession('s1')).toMatchObject({ userId: id, role: 'editor', email: 'ed@example.com' })
    sqlite.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run(id)
    expect(users.resolveSession('s1')).toBeNull()
    addSession('old', id, -10)
    expect(users.resolveSession('old')).toBeNull()
    expect(sqlite.prepare('SELECT 1 FROM sessions WHERE token = ?').get('old')).toBeUndefined()
    expect(users.resolveSession(undefined)).toBeNull()
  })

  it('revokes every session and refresh token of a user except the kept one', () => {
    const id = addUser('a@example.com', 'admin')
    addSession('keep', id)
    addSession('other', id)
    sqlite.prepare('INSERT INTO refresh_tokens (token, ip, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run('rt', '1', id, now(), now() + 100)
    users.revokeUserSessions(id, 'keep')
    expect(sqlite.prepare('SELECT token FROM sessions').all()).toEqual([{ token: 'keep' }])
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM refresh_tokens').get()).toEqual({ n: 0 })
  })

  it('counts active owners', () => {
    const a = addUser('o1@example.com', 'owner')
    addUser('o2@example.com', 'owner', { disabled: 1 })
    expect(users.countOwners()).toBe(1)
    expect(users.countOwners(a)).toBe(0)
  })
})

describe('passwords and second factor', () => {
  it('checks bcrypt and legacy plaintext passwords', () => {
    const hash = users.hashPassword('s3cret-password')
    expect(users.checkPassword('s3cret-password', hash)).toBe(true)
    expect(users.checkPassword('wrong', hash)).toBe(false)
    expect(users.checkPassword('anything', null)).toBe(false)
    expect(users.checkLegacyPassword('s3cret-password', hash)).toBe(true)
    expect(users.checkLegacyPassword('plain', 'plain')).toBe(true)
    expect(users.checkLegacyPassword('plain', 'plainx')).toBe(false)
    expect(users.checkLegacyPassword('x', undefined)).toBe(false)
  })

  it('validates passwords and emails', () => {
    expect(users.validatePassword('short')).toMatch(/10/)
    expect(users.validatePassword('long enough pw')).toBeNull()
    expect(users.validateEmail('  Ana@Example.COM ')).toBe('ana@example.com')
    expect(users.validateEmail('nope')).toBeNull()
  })

  it('finds users by email case-insensitively', () => {
    addUser('Mixed@Example.com', 'viewer')
    expect(users.getUserByEmail('mixed@example.com')?.role).toBe('viewer')
  })

  it('accepts a TOTP once and recovery codes once each', () => {
    const id = addUser('tfa@example.com', 'owner')
    const secret = totp.generateTotpSecret()
    users.storeTotpSecret(id, secret)
    const { codes, hashes } = users.generateRecoveryCodes()
    sqlite.prepare('UPDATE users SET totp_enabled = 1, recovery_codes = ? WHERE id = ?').run(JSON.stringify(hashes), id)

    // Secret is stored encrypted, never in clear
    const stored = sqlite.prepare('SELECT totp_secret FROM users WHERE id = ?').get(id) as { totp_secret: string }
    expect(stored.totp_secret).not.toContain(secret)

    const code = totp.totpCode(secret, totp.currentStep())
    expect(users.verifySecondFactor(users.getUser(id)!, code)).toBe(true)
    // Replay of the same code is refused
    expect(users.verifySecondFactor(users.getUser(id)!, code)).toBe(false)

    expect(codes).toHaveLength(10)
    expect(users.verifySecondFactor(users.getUser(id)!, codes[0].toUpperCase())).toBe(true)
    expect(users.verifySecondFactor(users.getUser(id)!, codes[0])).toBe(false)
    expect(users.publicUser(users.getUser(id)!).recoveryCodesLeft).toBe(9)
    expect(users.verifySecondFactor(users.getUser(id)!, 'zzzzz-zzzzz')).toBe(false)
    expect(users.verifySecondFactor(users.getUser(id)!, '')).toBe(false)
  })
})
