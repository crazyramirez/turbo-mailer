import { db } from '~/server/db/index'
import { campaigns, sends } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { processCampaign, SendConfig } from '~/server/utils/campaign-processor'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const sendId = Number(getRouterParam(event, 'sendId'))
  const config = useRuntimeConfig()

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Campaign already sending' })

  const [send] = await db.select().from(sends)
    .where(and(eq(sends.id, sendId), eq(sends.campaignId, campaignId)))
  if (!send) throw createError({ statusCode: 404, statusMessage: 'Send not found' })
  if (send.status === 'sent' || send.status === 'opened') {
    throw createError({ statusCode: 409, statusMessage: 'Already sent' })
  }

  await db.update(sends)
    .set({ status: 'pending', errorMsg: null })
    .where(eq(sends.id, sendId))

  await db.update(campaigns)
    .set({ status: 'sending' })
    .where(eq(campaigns.id, campaignId))

  const cfg: SendConfig = {
    smtpHost: String(config.smtpHost),
    smtpPort: Number(config.smtpPort),
    smtpUser: String(config.smtpUser),
    smtpPass: String(config.smtpPass),
    smtpSecure: Boolean(config.smtpSecure),
    smtpFromName: String(config.smtpFromName || 'TurboMailer'),
    smtpFromEmail: String(config.smtpFromEmail || config.smtpUser),
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

  processCampaign(campaignId, cfg).catch(async (err) => {
    console.error(`[send-resend] campaign=${campaignId} send=${sendId} error:`, err)
    await db.update(campaigns)
      .set({ status: 'paused' })
      .where(eq(campaigns.id, campaignId))
      .catch(() => {})
  })

  return { queued: true, sendId }
})
