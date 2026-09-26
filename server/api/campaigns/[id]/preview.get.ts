import { db } from '~/server/db/index'
import { campaigns, contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { compileCampaign, renderEmail } from '~/server/utils/email-render'

// Personalized preview through the exact send pipeline (variables,
// conditionals, preheader, UTM, email-client compile) — minus tracking.
// ?variant=B previews the A/B subject; no contactId = generic preview.
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const q = getQuery(event)
  const contactId = Number(q.contactId)

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  let vars: Record<string, any> = {}
  if (contactId) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId))
    if (!contact) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
    vars = { ...(contact.custom ?? {}), ...contact }
  }

  const config = useServerConfig()
  const rendered = renderEmail({
    compiled: compileCampaign(campaign),
    variant: q.variant === 'B' ? 'B' : 'A',
    vars,
    sendId: 0,
    baseUrl: String(config.trackingBaseUrl || '').replace(/\/$/, ''),
    secret: 'preview',
    utm: campaign.utmParams,
    companyAddress: String(config.companyAddress || ''),
    track: false,
  })

  return {
    html: rendered.html,
    text: rendered.text,
    subject: rendered.subject,
    preheader: campaign.preheader ?? null,
    contactEmail: vars.email ?? null,
  }
})
