import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Manual status override from the campaign page. The regular PUT deliberately
// coerces status to draft/scheduled/paused; this endpoint lets the user force
// a resting state — e.g. mark an imported campaign as 'sent', or bring a
// finished one back to 'draft' to edit and re-send.
//
// NOT settable here: 'sending' belongs exclusively to the send pipeline, and
// 'scheduled' requires a date so it goes through the scheduling flow instead.
// A campaign actively sending can't be overridden either — pause it first.

const SETTABLE = ['draft', 'paused', 'sent'] as const
type SettableStatus = typeof SETTABLE[number]

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ status?: string }>(event)
  const target = String(body?.status || '') as SettableStatus

  if (!SETTABLE.includes(target)) {
    throw createError({ statusCode: 400, statusMessage: `Status must be one of: ${SETTABLE.join(', ')}` })
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  if (campaign.status === 'sending') {
    throw createError({ statusCode: 409, statusMessage: 'Campaign is sending — pause it before changing its status' })
  }
  if (campaign.status === target) return campaign

  const patch: Record<string, unknown> = { status: target }

  if (target === 'sent') {
    // Marking as finished by hand: stamp finishedAt so lists/analytics sort sanely
    if (!campaign.finishedAt) patch.finishedAt = new Date()
  } else if (target === 'draft') {
    // Back to editable: clear schedule and finish marks; send records are kept
    // for reference and get recreated on the next send anyway
    patch.scheduledAt = null
    patch.finishedAt = null
  }

  const [updated] = await db.update(campaigns)
    .set(patch)
    .where(eq(campaigns.id, campaignId))
    .returning()

  logAudit('campaign.status_override', {
    campaignId,
    from: campaign.status,
    to: target,
  }, getClientIp(event))

  return updated
})
