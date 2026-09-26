import { sqlite } from '~/server/db/index'
import { emailHash, suppress, getSuppression } from '~/server/utils/suppression'
import { recordConsent, consentTrail } from '~/server/utils/consent'

// GDPR tooling: export everything we hold about a person (art. 15/20) and
// erase it (art. 17). Erasure keeps only a hash in the suppression list and
// consent trail, so the address can never be mailed again by accident.

export function exportContactData(contactId: number) {
  const c = sqlite.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as Record<string, any> | undefined
  if (!c) return null
  const lists = sqlite.prepare('SELECT l.id, l.name FROM list_contacts lc JOIN lists l ON l.id = lc.list_id WHERE lc.contact_id = ?').all(contactId)
  const sends = sqlite.prepare(
    `SELECT s.id, c.name AS campaign, s.personalized_subject AS subject, s.status, datetime(s.sent_at, 'unixepoch') AS sentAt
     FROM sends s LEFT JOIN campaigns c ON c.id = s.campaign_id WHERE s.contact_id = ? ORDER BY s.id`,
  ).all(contactId)
  const events = sqlite.prepare(
    `SELECT event_type AS type, url, ip, user_agent AS userAgent, datetime(created_at, 'unixepoch') AS at
     FROM tracking_events WHERE contact_id = ? ORDER BY id`,
  ).all(contactId)
  const parse = (v: any) => { try { return v ? JSON.parse(v) : null } catch { return v } }
  return {
    exportedAt: new Date().toISOString(),
    contact: {
      ...c,
      tags: parse(c.tags), custom: parse(c.custom), preferences: parse(c.preferences),
      topic_opt_outs: parse(c.topic_opt_outs), verification: parse(c.verification),
    },
    lists,
    suppression: getSuppression(c.email),
    consent: consentTrail(c.email),
    emails: sends,
    activity: events,
  }
}

export function eraseContact(contactId: number, opts: { suppress?: boolean; source?: string; ip?: string | null } = {}): boolean {
  const c = sqlite.prepare('SELECT id, email FROM contacts WHERE id = ?').get(contactId) as { id: number; email: string } | undefined
  if (!c) return false
  const placeholder = `erased-${emailHash(c.email).slice(0, 16)}@erased.invalid`
  sqlite.transaction(() => {
    sqlite.prepare('UPDATE sends SET email = ?, contact_id = NULL, personalized_subject = NULL WHERE contact_id = ? OR email = ? COLLATE NOCASE').run(placeholder, contactId, c.email)
    sqlite.prepare('UPDATE tracking_events SET ip = NULL, user_agent = NULL, contact_id = NULL WHERE contact_id = ?').run(contactId)
    sqlite.prepare('DELETE FROM contacts WHERE id = ?').run(contactId)
  })()
  if (opts.suppress !== false) suppress(c.email, 'manual', 'GDPR erasure', opts.source ?? 'gdpr')
  recordConsent({ contactId: null, email: c.email, action: 'erase', source: opts.source ?? 'gdpr', ip: opts.ip ?? null })
  return true
}
