import { sqlite } from '~/server/db/index'
import { clearSignal } from '~/server/utils/campaign-state'
import { startCampaign } from '~/server/utils/send-engine'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Retries sends that FAILED (temporary errors, provider blocks, interrupted
// transactions). Hard bounces are deliberately not retried: re-mailing an
// address that doesn't exist only damages sender reputation — the address is
// on the suppression list and the engine would skip it anyway.
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const campaign = sqlite.prepare('SELECT id, name, status FROM campaigns WHERE id = ?').get(campaignId) as { id: number; name: string; status: string } | undefined
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Already sending' })

  const reset = sqlite.transaction(() => {
    const n = sqlite.prepare(
      `UPDATE sends SET status = 'pending', error_msg = NULL, bounce_class = NULL, scheduled_for = NULL, attempts = 0
       WHERE campaign_id = ? AND status = 'failed'`,
    ).run(campaignId).changes
    if (n > 0) {
      sqlite.prepare(`UPDATE campaigns SET status = 'sending', pause_reason = NULL, fail_count = MAX(COALESCE(fail_count, 0) - ?, 0) WHERE id = ?`)
        .run(n, campaignId)
    }
    return n
  })()

  if (reset === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No failed sends to retry' })
  }

  clearSignal(campaignId)
  logAudit('campaign.retry', { campaignId, name: campaign.name, sends: reset }, getClientIp(event))
  startCampaign(campaignId)

  return { queued: true, campaignId, retried: reset }
})
