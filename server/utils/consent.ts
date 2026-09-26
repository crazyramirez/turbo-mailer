import { sqlite } from '~/server/db/index'
import { emailHash } from '~/server/utils/suppression'

export type ConsentAction = 'subscribe' | 'confirm' | 'unsubscribe' | 'resubscribe' | 'complaint' | 'import' | 'erase' | 'manual'

/** Appends to the GDPR consent trail. Never throws. */
export function recordConsent(entry: {
  contactId: number | null
  email: string
  action: ConsentAction
  source?: string | null
  ip?: string | null
  userAgent?: string | null
  consentText?: string | null
}): void {
  try {
    sqlite.prepare(
      `INSERT INTO consent_log (contact_id, email_hash, action, source, ip, user_agent, consent_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.contactId,
      emailHash(entry.email),
      entry.action,
      entry.source?.slice(0, 200) ?? null,
      entry.ip?.slice(0, 64) ?? null,
      entry.userAgent?.slice(0, 300) ?? null,
      entry.consentText?.slice(0, 2000) ?? null,
      Math.floor(Date.now() / 1000),
    )
  } catch (err) {
    console.warn('[consent] failed to record:', (err as Error)?.message)
  }
}

export function consentTrail(email: string) {
  return sqlite.prepare(
    `SELECT action, source, ip, user_agent AS userAgent, consent_text AS consentText, created_at AS createdAt
     FROM consent_log WHERE email_hash = ? ORDER BY created_at ASC, id ASC`,
  ).all(emailHash(email)) as { action: string; source: string | null; ip: string | null; userAgent: string | null; consentText: string | null; createdAt: number }[]
}
