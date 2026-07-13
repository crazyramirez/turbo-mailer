import { db } from '~/server/db/index'
import { campaigns, contacts, sends } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

type Campaign = typeof campaigns.$inferSelect
type Contact = typeof contacts.$inferSelect

// Creates the send records for a campaign's initial send and flips it to
// 'sending'. Shared by the manual send endpoint and the scheduler so A/B
// sampling behaves identically in both paths.
//
// A/B subject test: when subjectB is set and the list is big enough, an
// unbiased sample split 50/50 between variants goes out first; the rest is
// 'held' until the scheduler promotes the winning subject.
export async function setupCampaignSends(campaign: Campaign, recipientRows: Contact[]): Promise<void> {
  await db.delete(sends).where(eq(sends.campaignId, campaign.id))

  const abEnabled = Boolean(campaign.subjectB?.trim()) && recipientRows.length >= 10

  if (abEnabled) {
    const pct = Math.min(50, Math.max(5, Number(campaign.abSamplePct) || 20))
    const sampleSize = Math.max(4, Math.round(recipientRows.length * pct / 100))
    // Fisher-Yates shuffle so the sample is unbiased
    const shuffled = [...recipientRows]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    await db.insert(sends).values(
      shuffled.map((c, i) => ({
        campaignId: campaign.id,
        contactId: c.id,
        email: c.email,
        personalizedSubject: null,
        status: (i < sampleSize ? 'pending' : 'held') as 'pending' | 'held',
        variant: i < sampleSize ? ((i % 2 === 0 ? 'A' : 'B') as 'A' | 'B') : null,
      }))
    )
  } else {
    await db.insert(sends).values(
      recipientRows.map(c => ({
        campaignId: campaign.id,
        contactId: c.id,
        email: c.email,
        personalizedSubject: null,
        status: 'pending' as const,
      }))
    )
  }

  await db.update(campaigns).set({
    status: 'sending',
    startedAt: new Date(),
    totalRecipients: recipientRows.length,
    sentCount: 0,
    failCount: 0,
    openCount: 0,
    clickCount: 0,
    abPhase: abEnabled ? 'sample' : null,
    abDecideAt: null,
    abWinner: null,
  }).where(eq(campaigns.id, campaign.id))
}
