import { db } from '~/server/db/index'
import { campaigns, sends } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { processCampaign, SendConfig } from '~/server/utils/campaign-processor'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useRuntimeConfig()

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Already sending' })

  // Reset failed sends to pending
  await db.update(sends)
    .set({ status: 'pending', errorMsg: null })
    .where(and(eq(sends.campaignId, campaignId), eq(sends.status, 'failed')))

  // Set campaign to sending
  await db.update(campaigns)
    .set({ status: 'sending' })
    .where(eq(campaigns.id, campaignId))

  const {
    smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure,
    smtpFromName, smtpFromEmail,
  } = config

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
    console.error(`[campaign-retry] campaignId=${campaignId} fatal error:`, err)
    await db.update(campaigns)
      .set({ status: 'paused' })
      .where(eq(campaigns.id, campaignId))
      .catch(() => {})
  })

  return { queued: true, campaignId }
})
