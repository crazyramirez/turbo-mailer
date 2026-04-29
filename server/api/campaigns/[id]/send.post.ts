import { db } from '~/server/db/index'
import { campaigns, contacts, listContacts, sends } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { processCampaign, SendConfig } from '~/server/utils/campaign-processor'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useRuntimeConfig()

  const {
    smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure,
    smtpFromName, smtpFromEmail,
  } = config

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw createError({ statusCode: 500, statusMessage: 'SMTP credentials not configured' })
  }

  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Already sending' })
  if (!campaign.templateHtml) throw createError({ statusCode: 400, statusMessage: 'No template HTML set' })

  // Load recipients from list (only on initial send, not resume)
  if (campaign.status !== 'paused') {
    let recipientRows: typeof contacts.$inferSelect[] = []
    if (campaign.listId) {
      recipientRows = await db.select({ contacts })
        .from(contacts)
        .innerJoin(listContacts, and(
          eq(listContacts.contactId, contacts.id),
          eq(listContacts.listId, campaign.listId)
        ))
        .where(eq(contacts.status, 'active'))
        .then(r => r.map(x => x.contacts))
    }

    if (recipientRows.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No active recipients in list' })
    }

    // Clear any previous send records for this campaign if it was a draft
    await db.delete(sends).where(eq(sends.campaignId, campaignId))

    // Create send records
    await db.insert(sends).values(
      recipientRows.map(c => ({
        campaignId,
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
    }).where(eq(campaigns.id, campaignId))
  } else {
    // Resume
    await db.update(campaigns)
      .set({ status: 'sending' })
      .where(eq(campaigns.id, campaignId))
  }

  const cfg: SendConfig = {
    smtpHost: String(smtpHost),
    smtpPort: Number(smtpPort),
    smtpUser: String(smtpUser),
    smtpPass: String(smtpPass),
    smtpSecure: Boolean(smtpSecure),
    smtpFromName: String(smtpFromName || 'TurboMailer'),
    smtpFromEmail: String(smtpFromEmail || smtpUser),
    baseUrl: String(config.trackingBaseUrl || 'http://localhost:3000'),
    secret: String(config.unsubscribeSecret),
    delayMs: Number(config.smtpSendDelayMs),
    jitterMs: Number(config.smtpSendJitterMs),
    maxRetries: Number(config.smtpMaxRetries || 3),
    retryDelayMs: Number(config.smtpRetryDelayMs || 5000),
    dkimDomain: config.dkimDomain as string,
    dkimSelector: config.dkimSelector as string,
    dkimPrivateKey: config.dkimPrivateKey as string,
  }

  // Process in background
  processCampaign(campaignId, cfg).catch(async (err) => {
    console.error(`[campaign-send] campaignId=${campaignId} fatal error:`, err)
    await db.update(campaigns)
      .set({ status: 'paused' })
      .where(eq(campaigns.id, campaignId))
      .catch(() => {})
  })

  return { queued: true, campaignId }
})
