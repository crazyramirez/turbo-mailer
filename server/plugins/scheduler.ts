import { db } from '~/server/db/index'
import { campaigns, contacts, listContacts, sends } from '~/server/db/schema'
import { eq, lte, and, sql } from 'drizzle-orm'
import { processCampaign, type SendConfig } from '~/server/utils/campaign-processor'
import { clearSignal } from '~/server/utils/campaign-state'
import { setupCampaignSends, createFollowUpCampaign, getUnopenedRecipients } from '~/server/utils/send-setup'
import { isNull, isNotNull } from 'drizzle-orm'

function buildSendConfig(config: Record<string, any>): SendConfig {
  return {
    smtpHost: String(config.smtpHost),
    smtpPort: Number(config.smtpPort || 465),
    smtpUser: String(config.smtpUser),
    smtpPass: String(config.smtpPass),
    smtpSecure: Boolean(config.smtpSecure),
    smtpFromName: String(config.smtpFromName || 'TurboMailer'),
    smtpFromEmail: String(config.smtpFromEmail || config.smtpUser),
    baseUrl: String(config.trackingBaseUrl || 'http://localhost:3000'),
    secret: String(config.unsubscribeSecret),
    delayMs: Number(config.smtpSendDelayMs || 2000),
    jitterMs: Number(config.smtpSendJitterMs || 500),
    maxRetries: Number(config.smtpMaxRetries || 3),
    retryDelayMs: Number(config.smtpRetryDelayMs || 5000),
    maxEmailsPerSecond: Number(config.smtpMaxEmailsPerSecond || 0),
    dkimDomain: config.dkimDomain as string,
    dkimSelector: config.dkimSelector as string,
    dkimPrivateKey: config.dkimPrivateKey as string,
  }
}

// A/B test decision: once abDecideAt passes, pick the variant with more opens
// among the sample sends, release the holdout and resume the campaign.
async function decideAbWinners(config: Record<string, any>) {
  const due = await db
    .select()
    .from(campaigns)
    .where(and(
      eq(campaigns.abPhase, 'waiting'),
      // A user-paused campaign stays paused — resume re-enters via send.post
      eq(campaigns.status, 'sending'),
      lte(campaigns.abDecideAt, new Date()),
    ))

  for (const campaign of due) {
    const variantStats = await db
      .select({
        variant: sends.variant,
        opens: sql<number>`COUNT(*) FILTER (WHERE status = 'opened')`,
      })
      .from(sends)
      .where(eq(sends.campaignId, campaign.id))
      .groupBy(sends.variant)

    const opensA = Number(variantStats.find(v => v.variant === 'A')?.opens ?? 0)
    const opensB = Number(variantStats.find(v => v.variant === 'B')?.opens ?? 0)
    // Tie goes to A — the sender's primary choice
    const winner: 'A' | 'B' = opensB > opensA ? 'B' : 'A'

    await db.update(sends)
      .set({ status: 'pending' })
      .where(and(eq(sends.campaignId, campaign.id), eq(sends.status, 'held')))

    await db.update(campaigns).set({
      abPhase: 'final',
      abWinner: winner,
      status: 'sending',
    }).where(eq(campaigns.id, campaign.id))

    clearSignal(campaign.id)
    console.log(`[scheduler] A/B campaign ${campaign.id}: winner ${winner} (A=${opensA} opens, B=${opensB} opens) — sending final wave`)

    processCampaign(campaign.id, buildSendConfig(config)).catch(async (err) => {
      console.error(`[scheduler] A/B final wave campaignId=${campaign.id} error:`, err)
      await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, campaign.id)).catch(() => {})
    })
  }
}

// Auto follow-up (drip): finished campaigns with a configured follow-up
// subject spawn and send a follow-up to non-openers once the delay elapses.
async function processAutoFollowUps(config: Record<string, any>) {
  const candidates = await db
    .select()
    .from(campaigns)
    .where(and(
      eq(campaigns.status, 'sent'),
      isNotNull(campaigns.followUpSubject),
      isNull(campaigns.followUpDoneAt),
    ))

  const now = Date.now()
  for (const campaign of candidates) {
    if (!campaign.finishedAt || !campaign.followUpSubject?.trim()) continue
    const delayMs = Math.max(1, Number(campaign.followUpDelayHours) || 48) * 3600_000
    if (new Date(campaign.finishedAt).getTime() + delayMs > now) continue

    // Mark consumed FIRST — a crash mid-processing must never double-send
    await db.update(campaigns)
      .set({ followUpDoneAt: new Date() })
      .where(eq(campaigns.id, campaign.id))

    const recipients = await getUnopenedRecipients(campaign.id)
    if (recipients.length === 0) {
      console.log(`[scheduler] follow-up for campaign ${campaign.id}: everyone opened — nothing to send`)
      continue
    }

    const followUp = await createFollowUpCampaign(campaign, {
      subject: campaign.followUpSubject,
      name: `${campaign.name} — seguimiento`,
    })

    await db.update(campaigns)
      .set({ followUpCampaignId: followUp.id })
      .where(eq(campaigns.id, campaign.id))

    await setupCampaignSends(followUp, recipients)
    clearSignal(followUp.id)
    console.log(`[scheduler] follow-up ${followUp.id} for campaign ${campaign.id}: sending to ${recipients.length} non-openers`)

    processCampaign(followUp.id, buildSendConfig(config)).catch(async (err) => {
      console.error(`[scheduler] follow-up campaignId=${followUp.id} error:`, err)
      await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, followUp.id)).catch(() => {})
    })
  }
}

export default defineNitroPlugin(() => {
  // Avoid double-registration during Vite HMR
  if (import.meta.hot) return

  const CHECK_INTERVAL = 60_000 // every minute

  const handle = setInterval(async () => {
    const config = useServerConfig()
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass || !config.unsubscribeSecret) return

    try {
      await decideAbWinners(config)
    } catch (err) {
      console.error('[scheduler] error deciding A/B winners:', err)
    }

    try {
      await processAutoFollowUps(config)
    } catch (err) {
      console.error('[scheduler] error processing auto follow-ups:', err)
    }

    try {
      const due = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.status, 'scheduled'),
            lte(campaigns.scheduledAt, new Date())
          )
        )

      for (const campaign of due) {
        if (!campaign.templateHtml || !campaign.listId) continue

        // Load recipients
        const recipientRows = await db
          .select({ contacts })
          .from(contacts)
          .innerJoin(listContacts, and(
            eq(listContacts.contactId, contacts.id),
            eq(listContacts.listId, campaign.listId!)
          ))
          .where(eq(contacts.status, 'active'))
          .then(r => r.map(x => x.contacts))

        if (recipientRows.length === 0) {
          await db.update(campaigns).set({ status: 'draft' }).where(eq(campaigns.id, campaign.id))
          continue
        }

        // Create send records (A/B sampling handled inside when subjectB is set)
        await setupCampaignSends(campaign, recipientRows)

        clearSignal(campaign.id)

        processCampaign(campaign.id, buildSendConfig(config)).catch(async (err) => {
          console.error(`[scheduler] campaignId=${campaign.id} error:`, err)
          await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, campaign.id)).catch(() => {})
        })
      }
    } catch (err) {
      console.error('[scheduler] error checking scheduled campaigns:', err)
    }
  }, CHECK_INTERVAL)

  // Clean up on server shutdown
  process.once('SIGTERM', () => clearInterval(handle))
  process.once('SIGINT', () => clearInterval(handle))
})
