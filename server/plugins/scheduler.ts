import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq, lte, and, isNull, isNotNull } from 'drizzle-orm'
import { clearSignal } from '~/server/utils/campaign-state'
import { setupCampaignSends, createFollowUpCampaign, getUnopenedRecipients } from '~/server/utils/send-setup'
import { resolveRecipients } from '~/server/utils/recipients'
import { startCampaign, resumeInterruptedCampaigns } from '~/server/utils/send-engine'
import { profilesForSend, closeIdleTransports, closeAllTransports } from '~/server/utils/mailer'
import { backfillSuppressionsFromContacts } from '~/server/utils/suppression'
import { runScheduledJobs, registerJob, registerDailyJob } from '~/server/utils/jobs'
import { processDueRuns, enrollDateTriggers } from '~/server/utils/automation-engine'
import { getImapConfig, processBounces } from '~/server/utils/bounce-processor'
import { configFlag } from '~/server/utils/serverConfig'
import { recomputeEngagement } from '~/server/utils/engagement'
import { runBlocklistCheck } from '~/server/utils/blocklists'
import { runScheduledBackup } from '~/server/utils/backup'
import { sqlite } from '~/server/db/index'

// Daily cleanup of expired/ephemeral rows
function housekeeping() {
  const now = Math.floor(Date.now() / 1000)
  sqlite.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now)
  sqlite.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(now)
  sqlite.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').run(now - 86400)
  sqlite.prepare('DELETE FROM login_attempts WHERE first_attempt < ? AND (blocked_until IS NULL OR blocked_until < ?)').run(now - 86400, now)
  // Placement tests orphaned by a restart
  sqlite.prepare(`UPDATE placement_tests SET status = 'done', finished_at = ? WHERE status = 'running' AND created_at < ?`).run(now, now - 3600)
}
import { logAudit } from '~/server/utils/audit'
import { decideAbTest } from '~/server/utils/ab-decide'

// A/B test decision: once abDecideAt passes, pick the winning variant among
// the sample sends, release the holdout and resume the campaign (ab-decide.ts).
async function decideAbWinners() {
  const due = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(
      eq(campaigns.abPhase, 'waiting'),
      // A user-paused campaign stays paused — resume re-enters via send.post
      eq(campaigns.status, 'sending'),
      lte(campaigns.abDecideAt, new Date()),
    ))

  for (const campaign of due) {
    try {
      const decision = decideAbTest(campaign.id, 'auto', 'scheduler')
      if (decision) console.log(`[scheduler] A/B campaign ${campaign.id}: winner ${decision.winner} (${decision.basis}, p=${decision.pValue ?? '—'})`)
    } catch (err: any) {
      console.error(`[scheduler] A/B campaign ${campaign.id}:`, err?.message || err)
    }
  }
}

// Auto follow-up (drip): finished campaigns with a configured follow-up
// subject spawn and send a follow-up to non-openers once the delay elapses.
async function processAutoFollowUps() {
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

    // Same filters as any campaign: suppression, frequency, topic...
    const { recipients: eligible } = await resolveRecipients(followUp, useServerConfig())
    if (!eligible.length) {
      console.log(`[scheduler] follow-up ${followUp.id}: no eligible non-openers left`)
      continue
    }
    await setupCampaignSends(followUp, eligible)
    clearSignal(followUp.id)
    console.log(`[scheduler] follow-up ${followUp.id} for campaign ${campaign.id}: sending to ${eligible.length} non-openers`)
    startCampaign(followUp.id)
  }
}

async function launchScheduledCampaigns() {
  const due = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.status, 'scheduled'), lte(campaigns.scheduledAt, new Date())))

  for (const campaign of due) {
    if (!campaign.templateHtml) {
      await db.update(campaigns).set({ status: 'paused', pauseReason: 'no_template' }).where(eq(campaigns.id, campaign.id))
      continue
    }
    // Same recipient resolution as a manual send: segment, tag filter,
    // follow-up targeting, suppression, frequency caps...
    const { recipients } = await resolveRecipients(campaign, useServerConfig())
    if (recipients.length === 0) {
      await db.update(campaigns).set({ status: 'paused', pauseReason: 'no_recipients' }).where(eq(campaigns.id, campaign.id))
      continue
    }
    await setupCampaignSends(campaign, recipients)
    clearSignal(campaign.id)
    logAudit('campaign.send', { campaignId: campaign.id, name: campaign.name, scheduled: true })
    startCampaign(campaign.id)
  }
}

export default defineNitroPlugin((nitroApp) => {
  // Avoid double-registration during Vite HMR
  if (import.meta.hot) return

  const sendingReady = () => {
    const config = useServerConfig()
    return profilesForSend(config).length > 0 && !!config.unsubscribeSecret
  }

  try {
    const n = backfillSuppressionsFromContacts()
    if (n) console.log(`[scheduler] Suppression list backfilled with ${n} address(es)`)
  } catch (err) {
    console.error('[scheduler] suppression backfill failed:', err)
  }

  registerJob('ab-winners', 1, decideAbWinners, sendingReady)
  registerJob('auto-follow-ups', 1, processAutoFollowUps, sendingReady)
  registerJob('scheduled-campaigns', 1, launchScheduledCampaigns, sendingReady)
  registerJob('automations', 1, async () => { await processDueRuns() }, sendingReady)
  registerJob('idle-smtp-pools', 5, async () => closeIdleTransports())
  // Bounces, complaints, mailto unsubscribes and DMARC reports
  registerJob('inbound-mailbox', 10, async () => {
    const cfg = getImapConfig()
    if (cfg) await processBounces(cfg)
  }, () => configFlag(useServerConfig(), 'inboundAutoProcess', true) && !!getImapConfig())
  registerDailyJob('engagement-model', 3, () => recomputeEngagement())
  registerDailyJob('backup', 4, async () => { await runScheduledBackup() }, () => configFlag(useServerConfig(), 'backupEnabled', true))
  registerDailyJob('blocklists', 6, async () => { await runBlocklistCheck(useServerConfig()) }, () => configFlag(useServerConfig(), 'blocklistMonitor', true))
  registerDailyJob('housekeeping', 2, () => housekeeping())
  // Birthdays, anniversaries and other date-field automations
  registerDailyJob('date-triggers', 8, () => { enrollDateTriggers(); return processDueRuns() }, sendingReady)

  // Resume campaigns a crash/deploy interrupted (after the server settles)
  setTimeout(() => {
    if (!sendingReady()) return
    const resumed = resumeInterruptedCampaigns()
    if (resumed.length) {
      console.log(`[scheduler] Resumed interrupted campaign(s): ${resumed.join(', ')}`)
      logAudit('campaign.auto_resume', { campaignIds: resumed })
    }
  }, 5000)

  const handle = setInterval(() => { void runScheduledJobs() }, 60_000)

  const shutdown = () => {
    clearInterval(handle)
    closeAllTransports()
  }
  nitroApp.hooks.hook('close', shutdown)
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
})
