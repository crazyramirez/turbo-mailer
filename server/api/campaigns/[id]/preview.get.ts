import { db } from '~/server/db/index'
import { campaigns, contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { applyVars } from '~/server/utils/template'

// Personalized preview: renders the campaign template with a real contact's
// data — the exact same substitution path the send pipeline uses. Tracking
// and unsubscribe URLs are stubbed since no send record exists yet.

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const contactId = Number(getQuery(event).contactId)

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })

  let vars: Record<string, any> = {}
  if (contactId) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId))
    if (!contact) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
    vars = contact
  }

  const html = applyVars(campaign.templateHtml || '', vars)
    .replace(/\{\{\s*UNSUBSCRIBE_URL\s*\}\}/gi, '#unsubscribe-preview')
    .replace(/\{\{\s*PREFERENCES_URL\s*\}\}/gi, '#preferences-preview')

  return {
    html,
    subject: applyVars(campaign.subject || '', vars),
    contactEmail: vars.email ?? null,
  }
})
