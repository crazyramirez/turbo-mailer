import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getHeader, setHeader, setResponseStatus, createError, type H3Event } from 'h3'
import { sqlite } from '~/server/db/index'

// Public API keys: "tm_" + 40 random chars, stored as SHA-256 only (shown
// once at creation). Scopes limit what each integration can do.

export const API_SCOPES = ['send', 'contacts:read', 'contacts:write', 'events', 'campaigns:read'] as const
export type ApiScope = typeof API_SCOPES[number]

const hash = (k: string) => createHash('sha256').update(k).digest('hex')

export function createApiKey(name: string, scopes: string[]): { id: number; key: string; prefix: string } {
  const key = `tm_${randomBytes(30).toString('base64url')}`
  const prefix = key.slice(0, 10)
  const clean = scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s))
  if (!clean.length) throw createError({ statusCode: 400, statusMessage: 'Elige al menos un permiso' })
  const id = Number(sqlite.prepare('INSERT INTO api_keys (name, prefix, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name.slice(0, 80), prefix, hash(key), JSON.stringify(clean), Math.floor(Date.now() / 1000)).lastInsertRowid)
  return { id, key, prefix }
}

const buckets = new Map<number, { tokens: number; at: number }>()
const RATE_PER_MIN = 600

function allow(keyId: number): boolean {
  const now = Date.now()
  const b = buckets.get(keyId) ?? { tokens: RATE_PER_MIN, at: now }
  b.tokens = Math.min(RATE_PER_MIN, b.tokens + ((now - b.at) / 60_000) * RATE_PER_MIN)
  b.at = now
  if (b.tokens < 1) { buckets.set(keyId, b); return false }
  b.tokens -= 1
  buckets.set(keyId, b)
  return true
}

export interface ApiKeyRow { id: number; name: string; scopes: ApiScope[] }

/** Authenticates the request's API key and checks the scope. Throws 401/403/429. */
export function requireApiKey(event: H3Event, scope: ApiScope): ApiKeyRow {
  const raw = (getHeader(event, 'authorization')?.replace(/^Bearer\s+/i, '') || getHeader(event, 'x-api-key') || '').trim()
  if (!raw.startsWith('tm_')) throw createError({ statusCode: 401, statusMessage: 'Missing or invalid API key' })
  const h = hash(raw)
  const row = sqlite.prepare('SELECT id, name, key_hash AS keyHash, scopes, revoked_at AS revokedAt, last_used_at AS lastUsedAt FROM api_keys WHERE key_hash = ?')
    .get(h) as { id: number; name: string; keyHash: string; scopes: string; revokedAt: number | null; lastUsedAt: number | null } | undefined
  if (!row || row.revokedAt || !timingSafeEqual(Buffer.from(row.keyHash), Buffer.from(h))) {
    throw createError({ statusCode: 401, statusMessage: 'Missing or invalid API key' })
  }
  const scopes = JSON.parse(row.scopes || '[]') as ApiScope[]
  if (!scopes.includes(scope)) throw createError({ statusCode: 403, statusMessage: `API key lacks scope "${scope}"` })
  if (!allow(row.id)) throw createError({ statusCode: 429, statusMessage: 'Rate limit exceeded (600 requests/minute)' })
  const now = Math.floor(Date.now() / 1000)
  if (!row.lastUsedAt || now - row.lastUsedAt > 60) sqlite.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now, row.id)
  return { id: row.id, name: row.name, scopes }
}

/**
 * Idempotency: a repeated request with the same Idempotency-Key replays the
 * stored response instead of doing the work twice (24h window).
 */
export function idempotent<T>(event: H3Event, keyId: number, run: () => T | Promise<T>): Promise<T> | T {
  const key = String(getHeader(event, 'idempotency-key') || '').trim()
  if (!key) return run()
  if (key.length > 100) throw createError({ statusCode: 400, statusMessage: 'Idempotency-Key too long' })
  const scoped = `${keyId}:${key}`
  const hit = sqlite.prepare('SELECT status_code AS status, response FROM idempotency_keys WHERE key = ?').get(scoped) as { status: number; response: string } | undefined
  if (hit) {
    setResponseStatus(event, hit.status)
    setHeader(event, 'Idempotent-Replayed', 'true')
    return JSON.parse(hit.response) as T
  }
  const store = (value: T) => {
    sqlite.prepare('INSERT OR IGNORE INTO idempotency_keys (key, api_key_id, status_code, response, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(scoped, keyId, 200, JSON.stringify(value), Math.floor(Date.now() / 1000))
    return value
  }
  const out = run()
  return out instanceof Promise ? out.then(store) : store(out)
}
