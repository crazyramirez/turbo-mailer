import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// auth.ts imports the SQLite connection at module load — mock it out so
// token tests stay pure and never touch the real database.
vi.mock('~/server/db/index', () => ({
  db: {},
  sqlite: {},
}))

import {
  signUnsubscribeToken, verifyUnsubscribeToken,
  signClickToken, verifyClickToken,
  signOpenToken, verifyOpenToken,
  signConfirmToken, verifyConfirmToken,
  hashApiKey, verifyApiKey,
} from '~/server/utils/auth'

const SECRET = 'test-secret-0123456789'

describe('HMAC tokens', () => {
  it('unsubscribe token round-trips', () => {
    const t = signUnsubscribeToken(42, SECRET)
    expect(verifyUnsubscribeToken(42, t, SECRET)).toBe(true)
  })

  it('rejects token for a different sendId (no enumeration)', () => {
    const t = signUnsubscribeToken(42, SECRET)
    expect(verifyUnsubscribeToken(43, t, SECRET)).toBe(false)
  })

  it('rejects tampered signature', () => {
    const t = signUnsubscribeToken(42, SECRET)
    const tampered = t.slice(0, -2) + (t.endsWith('00') ? '11' : '00')
    expect(verifyUnsubscribeToken(42, tampered, SECRET)).toBe(false)
  })

  it('rejects token signed with a different secret', () => {
    const t = signUnsubscribeToken(42, 'other-secret')
    expect(verifyUnsubscribeToken(42, t, SECRET)).toBe(false)
  })

  it('tokens are purpose-scoped: open token invalid as unsubscribe token', () => {
    const t = signOpenToken(42, SECRET)
    expect(verifyUnsubscribeToken(42, t, SECRET)).toBe(false)
  })

  it('click token binds the URL', () => {
    const t = signClickToken(1, 'https://a.com', SECRET)
    expect(verifyClickToken(1, 'https://a.com', t, SECRET)).toBe(true)
    expect(verifyClickToken(1, 'https://evil.com', t, SECRET)).toBe(false)
  })

  it('confirm token round-trips and is scoped to the contact', () => {
    const t = signConfirmToken(99, SECRET)
    expect(verifyConfirmToken(99, t, SECRET)).toBe(true)
    expect(verifyConfirmToken(100, t, SECRET)).toBe(false)
    // Purpose-scoped: unusable as unsubscribe token
    expect(verifyUnsubscribeToken(99, t, SECRET)).toBe(false)
  })

  it('rejects garbage tokens without throwing', () => {
    expect(verifyUnsubscribeToken(1, '', SECRET)).toBe(false)
    expect(verifyUnsubscribeToken(1, 'not-a-token', SECRET)).toBe(false)
    expect(verifyUnsubscribeToken(1, '123.zzz', SECRET)).toBe(false)
  })
})

describe('token expiry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('expires after 30 days', () => {
    const t = signUnsubscribeToken(7, SECRET)
    vi.advanceTimersByTime(29 * 86400 * 1000)
    expect(verifyUnsubscribeToken(7, t, SECRET)).toBe(true)
    vi.advanceTimersByTime(2 * 86400 * 1000)
    expect(verifyUnsubscribeToken(7, t, SECRET)).toBe(false)
  })

  it('confirm token expires after 7 days', () => {
    const t = signConfirmToken(7, SECRET)
    vi.advanceTimersByTime(6 * 86400 * 1000)
    expect(verifyConfirmToken(7, t, SECRET)).toBe(true)
    vi.advanceTimersByTime(2 * 86400 * 1000)
    expect(verifyConfirmToken(7, t, SECRET)).toBe(false)
  })
})

describe('API key hashing', () => {
  it('verifies key against sha256 stored hash', () => {
    const stored = hashApiKey('my-api-key')
    expect(stored.startsWith('sha256:')).toBe(true)
    expect(verifyApiKey('my-api-key', stored)).toBe(true)
    expect(verifyApiKey('wrong-key', stored)).toBe(false)
  })

  it('supports legacy plaintext stored values', () => {
    expect(verifyApiKey('legacy', 'legacy')).toBe(true)
    expect(verifyApiKey('legacyX', 'legacy')).toBe(false)
  })
})
