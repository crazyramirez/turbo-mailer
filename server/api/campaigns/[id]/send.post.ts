import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { clearSignal } from '~/server/utils/campaign-state'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'
import { setupCampaignSends } from '~/server/utils/send-setup'
import { resolveRecipients } from '~/server/utils/recipients'
import { startCampaign } from '~/server/utils/send-engine'
import { profilesForSend } from '~/server/utils/mailer'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useServerConfig()

  if (!profilesForSend(config).length) {
    throw createError({ statusCode: 500, statusMessage: 'SMTP credentials not configured' })
  }
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Already sending' })
  if (campaign.status === 'sent') throw createError({ statusCode: 409, statusMessage: 'Campaign already sent — duplicate it or move it back to draft to send again' })
  if (!campaign.templateHtml) throw createError({ statusCode: 400, statusMessage: 'No template HTML set' })

  const resume = campaign.status === 'paused'

  if (!resume) {
    const { recipients } = await resolveRecipients(campaign, config)
    if (recipients.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No active recipients in list' })
    }
    // Create send records (A/B sampling / send-time optimization inside)
    await setupCampaignSends(campaign, recipients)
  } else {
    await db.update(campaigns)
      .set({ status: 'sending', pauseReason: null })
      .where(eq(campaigns.id, campaignId))
  }

  // Clear any leftover pause signal from a prior pause/resume cycle
  clearSignal(campaignId)

  logAudit('campaign.send', { campaignId, name: campaign.name, resume }, getClientIp(event))

  // Background run — the engine guards against a second loop on the same campaign
  startCampaign(campaignId)

  return { queued: true, campaignId }
})
