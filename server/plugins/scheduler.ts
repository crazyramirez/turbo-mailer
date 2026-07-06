import { db } from '~/server/db/index'
import { campaigns, contacts, listContacts, sends } from '~/server/db/schema'
import { eq, lte, and } from 'drizzle-orm'
import { processCampaign, type SendConfig } from '~/server/utils/campaign-processor'
import { clearSignal } from '~/server/utils/campaign-state'

export default defineNitroPlugin(() => {
  // Avoid double-registration during Vite HMR
  if (import.meta.hot) return

  const CHECK_INTERVAL = 60_000 // every minute

  const handle = setInterval(async () => {
    const config = useServerConfig()
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass || !config.unsubscribeSecret) return

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

        // Create send records
        await db.delete(sends).where(eq(sends.campaignId, campaign.id))
        await db.insert(sends).values(
          recipientRows.map(c => ({
            campaignId: campaign.id,
            contactId: c.id,
            email: c.email,
            personalizedSubject: null,
            status: 'pending' as const,
          }))
        )

        await db.update(campaigns).set({
          status: 'sending',
          startedAt: new Date(),
          totalRecipients: recipientRows.length,
          sentCount: 0,
          failCount: 0,
          openCount: 0,
          clickCount: 0,
        }).where(eq(campaigns.id, campaign.id))

        clearSignal(campaign.id)

        const cfg: SendConfig = {
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

        processCampaign(campaign.id, cfg).catch(async (err) => {
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
