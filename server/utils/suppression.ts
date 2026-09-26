import { createHash } from 'node:crypto'
import { sqlite } from '~/server/db/index'

// Global suppression list.
//
// Every address that unsubscribed, hard-bounced or complained lands here as a
// SHA-256 of its normalized form. The send engine refuses suppressed hashes no
// matter which list, segment, import or API call brings the address back —
// deleting and re-importing a contact can no longer resurrect it. Only an
// explicit, verified re-subscription (or a manual removal) lifts it.

export type SuppressionReason = 'unsubscribed' | 'bounced' | 'complained' | 'manual' | 'invalid'

export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase()
}

export function emailHash(email: string): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex')
}

/** a***@gmail.com — enough to recognise an entry, not to harvest addresses */
export function maskEmail(email: string): string {
  const [local, domain] = normalizeEmail(email).split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

export function suppress(email: string, reason: SuppressionReason, detail?: string | null, source?: string | null): void {
  if (!normalizeEmail(email)) return
  // The strongest reason wins: a complaint must not be downgraded to
  // "unsubscribed" by a later click on the unsubscribe link.
  const rank: Record<SuppressionReason, number> = { complained: 5, bounced: 4, invalid: 3, unsubscribed: 2, manual: 1 }
  const hash = emailHash(email)
  const existing = sqlite.prepare('SELECT reason FROM suppressions WHERE email_hash = ?').get(hash) as { reason: SuppressionReason } | undefined
  if (existing) {
    if (rank[reason] > rank[existing.reason]) {
      sqlite.prepare('UPDATE suppressions SET reason = ?, detail = ?, source = ? WHERE email_hash = ?')
        .run(reason, detail ?? null, source ?? null, hash)
    }
    return
  }
  sqlite.prepare('INSERT OR IGNORE INTO suppressions (email_hash, email_hint, reason, detail, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hash, maskEmail(email), reason, detail ?? null, source ?? null, Math.floor(Date.now() / 1000))
}

export function unsuppress(email: string): boolean {
  return sqlite.prepare('DELETE FROM suppressions WHERE email_hash = ?').run(emailHash(email)).changes > 0
}

/** Lifts only an unsubscribe/manual suppression — never a bounce or complaint. */
export function unsuppressIfOptOut(email: string): void {
  sqlite.prepare(`DELETE FROM suppressions WHERE email_hash = ? AND reason IN ('unsubscribed', 'manual')`).run(emailHash(email))
}

export function getSuppression(email: string): { reason: SuppressionReason; detail: string | null; createdAt: number } | null {
  const row = sqlite.prepare('SELECT reason, detail, created_at AS createdAt FROM suppressions WHERE email_hash = ?')
    .get(emailHash(email)) as { reason: SuppressionReason; detail: string | null; createdAt: number } | undefined
  return row ?? null
}

export function isSuppressed(email: string): boolean {
  return !!sqlite.prepare('SELECT 1 FROM suppressions WHERE email_hash = ?').get(emailHash(email))
}

/** Set of suppressed hashes among `emails` — chunked to stay under SQLite's variable cap. */
export function suppressedAmong(emails: string[]): Set<string> {
  const out = new Set<string>()
  const hashes = emails.map(e => emailHash(e))
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500)
    if (!chunk.length) continue
    const rows = sqlite.prepare(`SELECT email_hash FROM suppressions WHERE email_hash IN (${chunk.map(() => '?').join(',')})`)
      .all(...chunk) as { email_hash: string }[]
    rows.forEach(r => out.add(r.email_hash))
  }
  return out
}

/**
 * One-time backfill: contacts that are already unsubscribed/bounced get their
 * suppression entry. Idempotent (INSERT OR IGNORE), cheap after the first run.
 */
export function backfillSuppressionsFromContacts(): number {
  const rows = sqlite.prepare(`SELECT email, status FROM contacts WHERE status IN ('unsubscribed', 'bounced')`).all() as { email: string; status: string }[]
  if (!rows.length) return 0
  const insert = sqlite.prepare('INSERT OR IGNORE INTO suppressions (email_hash, email_hint, reason, detail, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
  const now = Math.floor(Date.now() / 1000)
  let added = 0
  sqlite.transaction(() => {
    for (const r of rows) {
      added += insert.run(emailHash(r.email), maskEmail(r.email), r.status === 'bounced' ? 'bounced' : 'unsubscribed', null, 'backfill', now).changes
    }
  })()
  return added
}
