import { sqlite } from '~/server/db/index'
import { clearSignal } from '~/server/utils/campaign-state'
import { startCampaign } from '~/server/utils/send-engine'
import { getSuppression, unsuppress } from '~/server/utils/suppression'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Re-queues ONE send of a campaign (failed, bounced or still pending).
// Re-sending a bounced address is an explicit human decision here (e.g. the
// mailbox was fixed), so its bounce suppression is lifted for this address —
// an unsubscribe or complaint is never overridden.
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const sendId = Number(getRouterParam(event, 'sendId'))

  const campaign = sqlite.prepare('SELECT id, status FROM campaigns WHERE id = ?').get(campaignId) as { id: number; status: string } | undefined
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Campaign already sending' })

  const send = sqlite.prepare('SELECT id, email, status, contact_id AS contactId FROM sends WHERE id = ? AND campaign_id = ?')
    .get(sendId, campaignId) as { id: number; email: string; status: string; contactId: number | null } | undefined
  if (!send) throw createError({ statusCode: 404, statusMessage: 'Send not found' })
  if (send.status === 'sent' || send.status === 'opened' || send.status === 'sending') {
    throw createError({ statusCode: 409, statusMessage: 'Already sent' })
  }

  const sup = getSuppression(send.email)
  if (sup && sup.reason !== 'bounced') {
    throw createError({ statusCode: 409, statusMessage: `El contacto está en la lista de supresión (${sup.reason}) y no puede recibir envíos` })
  }

  sqlite.transaction(() => {
    if (sup?.reason === 'bounced') {
      unsuppress(send.email)
      if (send.contactId) {
        sqlite.prepare(`UPDATE contacts SET status = 'active', fail_count = 0, updated_at = ? WHERE id = ? AND status = 'bounced'`)
          .run(Math.floor(Date.now() / 1000), send.contactId)
      }
    }
    const wasFailure = send.status === 'failed' || send.status === 'bounced'
    sqlite.prepare(`UPDATE sends SET status = 'pending', error_msg = NULL, bounce_class = NULL, scheduled_for = NULL, attempts = 0 WHERE id = ?`).run(sendId)
    sqlite.prepare(`UPDATE campaigns SET status = 'sending', pause_reason = NULL, fail_count = MAX(COALESCE(fail_count, 0) - ?, 0) WHERE id = ?`)
      .run(wasFailure ? 1 : 0, campaignId)
  })()

  clearSignal(campaignId)
  logAudit('campaign.resend_one', { campaignId, sendId, email: send.email }, getClientIp(event))
  startCampaign(campaignId)

  return { queued: true, sendId }
})
