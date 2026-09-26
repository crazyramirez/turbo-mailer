import { db, sqlite } from '~/server/db/index'
import { campaigns, contacts, listContacts } from '~/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { contactMatchesTags } from '~/server/utils/segment'
import { getUnopenedRecipients } from '~/server/utils/send-setup'
import { suppressedAmong, emailHash, normalizeEmail } from '~/server/utils/suppression'
import { configFlag, configNumber } from '~/server/utils/serverConfig'
import { evaluateSegmentById } from '~/server/utils/segments'

type Campaign = typeof campaigns.$inferSelect
type Contact = typeof contacts.$inferSelect

export interface RecipientResolution {
  recipients: Contact[]
  excluded: {
    notInTags: number
    suppressed: number
    sunset: number
    frequency: number
    topic: number
    duplicate: number
  }
}

async function baseRecipients(campaign: Campaign): Promise<Contact[]> {
  if (campaign.resendOfId) {
    // Follow-up: delivered-but-unopened recipients of the source campaign
    return getUnopenedRecipients(campaign.resendOfId)
  }
  if (campaign.segmentId) {
    const seg = await evaluateSegmentById(campaign.segmentId) as Contact[]
    // A segment scoped to a list = intersection
    if (!campaign.listId) return seg.filter(c => c.status === 'active')
    const inList = new Set(
      (sqlite.prepare('SELECT contact_id FROM list_contacts WHERE list_id = ?').all(campaign.listId) as { contact_id: number }[])
        .map(r => r.contact_id),
    )
    return seg.filter(c => c.status === 'active' && inList.has(c.id))
  }
  if (campaign.listId) {
    return db.select({ contacts })
      .from(contacts)
      .innerJoin(listContacts, and(
        eq(listContacts.contactId, contacts.id),
        eq(listContacts.listId, campaign.listId),
      ))
      .where(eq(contacts.status, 'active'))
      .then(r => r.map(x => x.contacts))
  }
  return []
}

export function frequencyWindowDays(contact: Pick<Contact, 'preferences'>): number {
  const f = contact.preferences?.frequency
  if (f === 'weekly') return 7
  if (f === 'monthly') return 30
  return 0
}

/** True when the contact's chosen frequency forbids another email right now. */
export function blockedByFrequency(contact: Pick<Contact, 'preferences' | 'lastSentAt'>, now = Date.now()): boolean {
  const days = frequencyWindowDays(contact)
  if (!days || !contact.lastSentAt) return false
  return now - new Date(contact.lastSentAt).getTime() < days * 86_400_000
}

export function sunsetSettings(config: Record<string, any>) {
  return {
    enabled: configFlag(config, 'sunsetEnabled', false),
    days: Math.max(30, configNumber(config, 'sunsetDays', 180)),
    minSends: Math.max(1, configNumber(config, 'sunsetMinSends', 5)),
  }
}

/** Would the sunset policy exclude this contact? (never engaged in `days` and mailed repeatedly) */
export function isSunset(contact: Pick<Contact, 'lastEngagedAt' | 'sentSinceEngaged' | 'createdAt'>, s: { days: number; minSends: number }, now = Date.now()): boolean {
  const cutoff = now - s.days * 86_400_000
  if ((contact.sentSinceEngaged ?? 0) < s.minSends) return false
  if (contact.createdAt && new Date(contact.createdAt).getTime() > cutoff) return false
  if (contact.lastEngagedAt && new Date(contact.lastEngagedAt).getTime() > cutoff) return false
  return true
}

/**
 * Who a campaign will actually go to, and why the rest won't.
 * Single source of truth for the send endpoint, the scheduler and the precheck
 * — the scheduler used to load the raw list, ignoring segmentation and
 * follow-up targeting.
 */
export async function resolveRecipients(campaign: Campaign, config: Record<string, any>): Promise<RecipientResolution> {
  const excluded = { notInTags: 0, suppressed: 0, sunset: 0, frequency: 0, topic: 0, duplicate: 0 }
  let rows = await baseRecipients(campaign)

  // Tag filter
  const tagged = rows.filter(c => contactMatchesTags(c.tags, campaign.tagFilter))
  excluded.notInTags = rows.length - tagged.length
  rows = tagged

  // Same mailbox twice (case variants) → one email
  const seen = new Set<string>()
  rows = rows.filter(c => {
    const key = normalizeEmail(c.email)
    if (seen.has(key)) { excluded.duplicate++; return false }
    seen.add(key)
    return true
  })

  // Global suppression list
  const suppressed = suppressedAmong(rows.map(c => c.email))
  if (suppressed.size) {
    rows = rows.filter(c => {
      const hit = suppressed.has(emailHash(c.email))
      if (hit) excluded.suppressed++
      return !hit
    })
  }

  // Preference-center topic opt-outs
  if (campaign.topicId) {
    rows = rows.filter(c => {
      const out = Array.isArray(c.topicOptOuts) && c.topicOptOuts.map(Number).includes(Number(campaign.topicId))
      if (out) excluded.topic++
      return !out
    })
  }

  // Contact-chosen frequency (weekly / monthly digest preference)
  const now = Date.now()
  rows = rows.filter(c => {
    const blocked = blockedByFrequency(c, now)
    if (blocked) excluded.frequency++
    return !blocked
  })

  // Sunset policy (follow-ups target recent recipients — never sunset them)
  const sunset = sunsetSettings(config)
  if (sunset.enabled && !campaign.ignoreSunset && !campaign.resendOfId) {
    rows = rows.filter(c => {
      const out = isSunset(c, sunset, now)
      if (out) excluded.sunset++
      return !out
    })
  }

  return { recipients: rows, excluded }
}
