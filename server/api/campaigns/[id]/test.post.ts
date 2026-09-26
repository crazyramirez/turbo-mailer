import { sqlite } from '~/server/db/index'
import { compileCampaign, renderEmail } from '~/server/utils/email-render'
import { profilesForSend, getTransport, senderIdentity, formatAddress, newMessageId } from '~/server/utils/mailer'
import { classifySmtpError, describeFailure } from '~/server/utils/smtp-classify'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'
import { isValidEmail } from '~/server/utils/validate'

const MAX_TEST_RECIPIENTS = 10

/**
 * Test send: delivers the campaign to a few chosen addresses WITHOUT touching
 * campaign status, send records or stats. Rendered by the same pipeline as a
 * real send (preheader, UTM, email-client fixes, DKIM) minus tracking; the
 * unsubscribe placeholders point at the app since no send record exists.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useServerConfig()

  const profiles = profilesForSend(config)
  if (!profiles.length) {
    throw createError({ statusCode: 500, statusMessage: 'SMTP credentials not configured' })
  }

  const body = await readBody<{ emails?: string[]; variant?: 'A' | 'B' }>(event)
  const emails = Array.from(new Set(
    (body?.emails ?? []).map(e => String(e).trim().toLowerCase()).filter(Boolean),
  ))

  if (emails.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No test emails provided' })
  }
  if (emails.length > MAX_TEST_RECIPIENTS) {
    throw createError({ statusCode: 400, statusMessage: `Max ${MAX_TEST_RECIPIENTS} test recipients` })
  }
  const invalid = emails.find(e => !isValidEmail(e))
  if (invalid) {
    throw createError({ statusCode: 400, statusMessage: `Invalid email: ${invalid}` })
  }

  const campaign = sqlite.prepare(
    `SELECT id, name, subject, subject_b AS subjectB, template_html AS templateHtml, preheader, sender_profile_id AS senderProfileId, utm_params AS utmParams
     FROM campaigns WHERE id = ?`,
  ).get(campaignId) as any
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (!campaign.templateHtml) throw createError({ statusCode: 400, statusMessage: 'No template HTML set' })

  const compiled = compileCampaign(campaign)
  const baseUrl = String(config.trackingBaseUrl || 'http://localhost:3000').replace(/\/$/, '')
  const profile = profilesForSend(config, campaign.senderProfileId)[0]
  const identity = senderIdentity(profile, config)
  const variant = body?.variant === 'B' && campaign.subjectB ? 'B' : 'A'
  let utm = null
  try { utm = campaign.utmParams ? JSON.parse(campaign.utmParams) : null } catch {}

  const results: { email: string; ok: boolean; error?: string }[] = []

  for (const email of emails) {
    // If a test address matches a contact, use its data for variables
    const contact = sqlite.prepare('SELECT * FROM contacts WHERE email = ? COLLATE NOCASE').get(email) as Record<string, any> | undefined
    let custom = {}
    try { custom = contact?.custom ? JSON.parse(contact.custom) : {} } catch {}
    const vars = contact ? { ...custom, ...contact } : { email }

    const rendered = renderEmail({
      compiled, variant, vars, sendId: 0, baseUrl, secret: String(config.unsubscribeSecret || 'test'),
      utm, companyAddress: String(config.companyAddress || ''), track: false,
    })

    try {
      await getTransport(profile, config).sendMail({
        from: formatAddress(identity.name, identity.email),
        to: email,
        replyTo: identity.replyTo,
        subject: `[TEST] ${rendered.subject || campaign.name}`,
        html: rendered.html,
        text: rendered.text,
        messageId: newMessageId(identity.domain),
      })
      results.push({ email, ok: true })
    } catch (err: any) {
      results.push({ email, ok: false, error: describeFailure(classifySmtpError(err)) })
    }
  }

  logAudit('campaign.test', {
    campaignId,
    name: campaign.name,
    recipients: emails.length,
    failed: results.filter(r => !r.ok).length,
  }, getClientIp(event))

  return { results }
})
