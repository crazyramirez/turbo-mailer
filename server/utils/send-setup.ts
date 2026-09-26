import { db, sqlite } from '~/server/db/index'
import { campaigns, contacts, sends } from '~/server/db/schema'
import { eq, and, or } from 'drizzle-orm'

type Campaign = typeof campaigns.$inferSelect
type Contact = typeof contacts.$inferSelect

// Contacts who received the source campaign but never really opened it and are
// still active. Used by manual re-sends, auto follow-ups and the send flow.
//
// 'sent' means the pixel never fired at all. Sends marked 'opened' purely by a
// privacy-relay prefetch (openedByProxy) are included too: nobody read those,
// so excluding them would silently drop the follow-up for a large share of
// Apple Mail recipients.
export async function getUnopenedRecipients(sourceCampaignId: number): Promise<Contact[]> {
  return db.select({ contacts })
    .from(contacts)
    .innerJoin(sends, eq(sends.contactId, contacts.id))
    .where(and(
      eq(sends.campaignId, sourceCampaignId),
      eq(contacts.status, 'active'),
      or(
        eq(sends.status, 'sent'),
        and(eq(sends.status, 'opened'), eq(sends.openedByProxy, true)),
      ),
    ))
    .then(r => r.map(x => x.contacts))
}

// Clones a finished campaign as a follow-up draft targeting its non-openers.
// Shared by the manual resend-unopened endpoint and the drip scheduler.
export async function createFollowUpCampaign(
  source: Campaign,
  opts: { subject?: string; name?: string } = {},
): Promise<Campaign> {
  const [created] = await db.insert(campaigns).values({
    name: opts.name?.trim().slice(0, 255) || `${source.name} — follow-up`,
    // Default to the subject that actually won the A/B test
    subject: opts.subject?.trim().slice(0, 255)
      || (source.abWinner === 'B' && source.subjectB ? source.subjectB : source.subject),
    preheader: source.preheader,
    templateName: source.templateName,
    templateHtml: source.templateHtml,
    listId: source.listId,
    tagFilter: Array.isArray(source.tagFilter) ? source.tagFilter : [],
    topicId: source.topicId,
    senderProfileId: source.senderProfileId,
    utmParams: source.utmParams,
    resendOfId: source.id,
    status: 'draft',
    unsubEmailSubject: source.unsubEmailSubject,
    unsubEmailMessage: source.unsubEmailMessage,
    resubEmailSubject: source.resubEmailSubject,
    resubEmailMessage: source.resubEmailMessage,
  }).returning()
  return created
}

// Creates the send records for a campaign's initial send and flips it to
// 'sending'. Shared by the manual send endpoint and the scheduler so A/B
// sampling behaves identically in both paths.
//
// A/B subject test: when subjectB is set and the list is big enough, an
// unbiased sample split 50/50 between variants goes out first; the rest is
// 'held' until the scheduler promotes the winning subject.
// Pure A/B sample planner: shuffles (Fisher-Yates, unbiased) and assigns the
// first `pct`% (min 4) alternating A/B; the rest is the held-back holdout.
export function planAbSplit<T>(
  recipients: T[],
  samplePct: number,
): { item: T; status: 'pending' | 'held'; variant: 'A' | 'B' | null }[] {
  const pct = Math.min(50, Math.max(5, Number(samplePct) || 20))
  const sampleSize = Math.max(4, Math.round(recipients.length * pct / 100))
  const shuffled = [...recipients]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.map((item, i) => ({
    item,
    status: i < sampleSize ? 'pending' as const : 'held' as const,
    variant: i < sampleSize ? ((i % 2 === 0 ? 'A' : 'B') as 'A' | 'B') : null,
  }))
}

/**
 * Send-time optimization: the next occurrence of the contact's best UTC hour
 * within 24h of `from`, spread randomly inside that hour so thousands of
 * contacts sharing it don't all land on the same second. null = send now.
 */
export function stoScheduledFor(bestUtcHour: number | null | undefined, from: Date, rand = Math.random): Date | null {
  if (bestUtcHour === null || bestUtcHour === undefined || !Number.isInteger(bestUtcHour) || bestUtcHour < 0 || bestUtcHour > 23) return null
  const at = new Date(from)
  at.setUTCHours(bestUtcHour, Math.floor(rand() * 60), 0, 0)
  if (at.getTime() <= from.getTime()) at.setUTCDate(at.getUTCDate() + 1)
  // Already inside the best hour and it's still early in it: go now
  if (at.getTime() - from.getTime() > 23 * 3600_000 && from.getUTCHours() === bestUtcHour) return null
  return at
}

export async function setupCampaignSends(campaign: Campaign, recipientRows: Contact[]): Promise<void> {
  const abEnabled = Boolean(campaign.subjectB?.trim()) && recipientRows.length >= 10
  // STO and an A/B sample don't mix: the sample must finish before the wait
  const stoEnabled = Boolean(campaign.stoEnabled) && !abEnabled
  const now = new Date()

  type Row = { contactId: number; email: string; status: 'pending' | 'held'; variant: 'A' | 'B' | null; scheduledFor: number | null }
  const rows: Row[] = abEnabled
    ? planAbSplit(recipientRows, Number(campaign.abSamplePct) || 20).map(p => ({
        contactId: p.item.id, email: p.item.email, status: p.status, variant: p.variant, scheduledFor: null,
      }))
    : recipientRows.map(c => {
        const at = stoEnabled ? stoScheduledFor(c.bestSendHour, now) : null
        return { contactId: c.id, email: c.email, status: 'pending' as const, variant: null, scheduledFor: at ? Math.floor(at.getTime() / 1000) : null }
      })

  // One prepared statement inside one transaction: fast for 100k rows and
  // immune to SQLite's bound-variable cap, which a single multi-row INSERT
  // hit at ~5.4k recipients ("too many SQL variables").
  const insert = sqlite.prepare(
    `INSERT INTO sends (campaign_id, contact_id, email, status, variant, scheduled_for, attempts, opened_by_proxy)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
  )
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM sends WHERE campaign_id = ?').run(campaign.id)
    for (const r of rows) insert.run(campaign.id, r.contactId, r.email, r.status, r.variant, r.scheduledFor)
    sqlite.prepare(
      `UPDATE campaigns SET status = 'sending', started_at = ?, finished_at = NULL, total_recipients = ?,
         sent_count = 0, fail_count = 0, open_count = 0, confirmed_open_count = 0, click_count = 0,
         bounce_count = 0, complaint_count = 0, unsubscribe_count = 0, pause_reason = NULL,
         ab_phase = ?, ab_decide_at = NULL, ab_winner = NULL
       WHERE id = ?`,
    ).run(Math.floor(now.getTime() / 1000), rows.length, abEnabled ? 'sample' : null, campaign.id)
  })()
}
