import { startPlacementTest } from '~/server/utils/placement'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const res = await startPlacementTest(campaignId)
  logAudit('campaign.placement_test', { campaignId, testId: res.id }, getClientIp(event))
  return res
})
