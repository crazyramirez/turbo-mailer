import { sqlite } from '~/server/db/index'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'
import { getSuppression, normalizeEmail } from '~/server/utils/suppression'
import { recordConsent } from '~/server/utils/consent'
import { sendConfirmationEmail } from '~/server/utils/confirm-email'
import { emitWebhook } from '~/server/utils/webhook'
import { configFlag } from '~/server/utils/serverConfig'
import { sanitizeCustomValues } from '~/server/utils/custom-fields'
import { emitContactEvent } from '~/server/utils/contact-events'

// One subscription path for the API (/api/subscribe, /api/subscribers) and
// public forms. Rules that protect deliverability and consent:
//
//  - A bounced/complained/invalid address is never re-activated.
//  - An address that UNSUBSCRIBED can come back only through a confirmation
//    email — anyone can type someone else's address into a form.
//  - With double opt-in on, new contacts stay 'inactive' until they click.

export type SubscribeOutcome =
  | { status: 'subscribed'; contactId: number; created: boolean }
  | { status: 'pending_confirmation'; contactId: number; created: boolean }
  | { status: 'updated'; contactId: number }
  | { status: 'rejected'; reason: 'invalid_email' | 'suppressed' }

export interface SubscribeInput {
  raw: Record<string, any>
  tags?: unknown
  listIds?: unknown
  custom?: unknown
  source: string
  ip?: string | null
  userAgent?: string | null
  consentText?: string | null
  /** Force double opt-in (forms decide per form); undefined = global setting */
  doubleOptIn?: boolean
}

// Don't let one address trigger a confirmation email storm
const lastConfirmSent = new Map<number, number>()
const CONFIRM_RESEND_MS = 10 * 60_000

function maybeSendConfirmation(contactId: number, email: string, name: string | null, config: Record<string, any>) {
  const last = lastConfirmSent.get(contactId)
  if (last && Date.now() - last < CONFIRM_RESEND_MS) return
  lastConfirmSent.set(contactId, Date.now())
  sendConfirmationEmail(contactId, email, name, config)
    .catch(err => console.error('[subscribe] confirmation email failed:', err?.message))
}

function validListIds(listIds: unknown): number[] {
  if (!Array.isArray(listIds)) return []
  const ids = [...new Set(listIds.map(Number).filter(n => Number.isInteger(n) && n > 0))]
  if (!ids.length) return []
  const rows = sqlite.prepare(`SELECT id FROM lists WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number }[]
  return rows.map(r => r.id)
}

function cleanTags(tags: unknown): string[] | null {
  if (!Array.isArray(tags)) return null
  return [...new Set(tags.map(t => String(t).trim().slice(0, 50)).filter(Boolean))].slice(0, 50)
}

export function subscribeContact(input: SubscribeInput): SubscribeOutcome {
  const config = useServerConfig()
  const fields = sanitizeContactFields(input.raw)
  const email = normalizeEmail(fields.email)
  if (!email || !isValidEmail(email)) return { status: 'rejected', reason: 'invalid_email' }

  const smtpReady = Boolean(config.smtpHost && config.smtpUser && config.smtpPass && config.unsubscribeSecret)
  const doubleOptIn = (input.doubleOptIn ?? configFlag(config, 'doubleOptIn')) && smtpReady
  const tags = cleanTags(input.tags)
  const lists = validListIds(input.listIds)
  const custom = sanitizeCustomValues(input.custom)
  const sup = getSuppression(email)
  if (sup && (sup.reason === 'bounced' || sup.reason === 'complained' || sup.reason === 'invalid')) {
    return { status: 'rejected', reason: 'suppressed' }
  }

  const now = Math.floor(Date.now() / 1000)
  const existing = sqlite.prepare('SELECT * FROM contacts WHERE email = ? COLLATE NOCASE').get(email) as Record<string, any> | undefined

  const addToLists = (contactId: number) => {
    const ins = sqlite.prepare('INSERT OR IGNORE INTO list_contacts (list_id, contact_id) VALUES (?, ?)')
    lists.forEach(l => ins.run(l, contactId))
  }

  // Only non-empty incoming values overwrite stored data
  const assignments: string[] = []
  const params: unknown[] = []
  const colMap: Record<string, string> = { name: 'name', company: 'company', role: 'role', phone: 'phone', linkedin: 'linkedin', url: 'url', youtube: 'youtube', instagram: 'instagram' }
  for (const [k, col] of Object.entries(colMap)) {
    const v = (fields as any)[k]
    if (v) { assignments.push(`${col} = ?`); params.push(v) }
  }

  if (existing) {
    const contactId = Number(existing.id)
    const status = String(existing.status)
    const mergedTags = tags ? JSON.stringify([...new Set([...(safeJson<string[]>(existing.tags, [])), ...tags])]) : null
    const mergedCustom = Object.keys(custom).length ? JSON.stringify({ ...safeJson<Record<string, unknown>>(existing.custom, {}), ...custom }) : null
    // An earlier opt-out always needs proof it's really them
    const needsConfirm = status === 'unsubscribed' || doubleOptIn || !!sup
    // Previously unsubscribed + no SMTP to confirm: keep them out
    if (status === 'unsubscribed' && !smtpReady) return { status: 'rejected', reason: 'suppressed' }
    if (status === 'bounced') return { status: 'rejected', reason: 'suppressed' }

    const nextStatus = status === 'active' ? 'active' : needsConfirm ? 'inactive' : 'active'
    sqlite.transaction(() => {
      sqlite.prepare(
        `UPDATE contacts SET ${assignments.length ? assignments.join(', ') + ', ' : ''}
           tags = COALESCE(?, tags), custom = COALESCE(?, custom), status = ?, updated_at = ?
         WHERE id = ?`,
      ).run(...params, mergedTags, mergedCustom, nextStatus, now, contactId)
      addToLists(contactId)
    })()

    if (status === 'active') return { status: 'updated', contactId }
    if (nextStatus === 'inactive') {
      recordConsent({ contactId, email, action: 'subscribe', source: input.source, ip: input.ip, userAgent: input.userAgent, consentText: input.consentText })
      maybeSendConfirmation(contactId, email, fields.name, config)
      return { status: 'pending_confirmation', contactId, created: false }
    }
    recordConsent({ contactId, email, action: 'subscribe', source: input.source, ip: input.ip, userAgent: input.userAgent, consentText: input.consentText })
    emitWebhook('contact.subscribed', { contactId, email, source: input.source })
    emitContactEvent({ type: 'subscribed', contactId, listIds: lists, source: input.source })
    return { status: 'subscribed', contactId, created: false }
  }

  // An address that opted out (or was erased) comes back only with proof
  const optedOutBefore = sup?.reason === 'unsubscribed' || sup?.reason === 'manual'
  if (optedOutBefore && !smtpReady) return { status: 'rejected', reason: 'suppressed' }
  const initialStatus = doubleOptIn || optedOutBefore ? 'inactive' : 'active'
  let contactId = 0
  sqlite.transaction(() => {
    const res = sqlite.prepare(
      `INSERT INTO contacts (email, name, company, role, phone, linkedin, url, youtube, instagram, tags, custom, status, source,
         fail_count, sub_change_count, sent_since_engaged, engagement_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    ).run(email, fields.name, fields.company, fields.role, fields.phone, fields.linkedin, fields.url, fields.youtube, fields.instagram,
      JSON.stringify(tags ?? []), Object.keys(custom).length ? JSON.stringify(custom) : null, initialStatus, input.source.slice(0, 100), now, now)
    contactId = Number(res.lastInsertRowid)
    addToLists(contactId)
  })()

  recordConsent({ contactId, email, action: 'subscribe', source: input.source, ip: input.ip, userAgent: input.userAgent, consentText: input.consentText })
  if (initialStatus === 'inactive') {
    maybeSendConfirmation(contactId, email, fields.name, config)
    return { status: 'pending_confirmation', contactId, created: true }
  }
  emitWebhook('contact.subscribed', { contactId, email, source: input.source })
  emitContactEvent({ type: 'subscribed', contactId, listIds: lists, source: input.source })
  return { status: 'subscribed', contactId, created: true }
}

function safeJson<T>(v: unknown, fb: T): T {
  if (v === null || v === undefined || v === '') return fb
  if (typeof v !== 'string') return v as T
  try { return JSON.parse(v) as T } catch { return fb }
}
