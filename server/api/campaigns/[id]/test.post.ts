import nodemailer from 'nodemailer'
import { db } from '~/server/db/index'
import { campaigns, contacts } from '~/server/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { compileTemplate } from '~/server/utils/template'
import { sendWithRetry } from '~/server/utils/campaign-processor'
import { htmlToText } from '~/server/utils/html-to-text'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

const MAX_TEST_RECIPIENTS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Test send: delivers the campaign to a small list of chosen emails
 * WITHOUT touching campaign status, sends records or stats.
 * No tracking pixel / click-wrapping — unsubscribe placeholders are neutralized.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useServerConfig()

  const {
    smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure,
    smtpFromName, smtpFromEmail,
  } = config

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw createError({ statusCode: 500, statusMessage: 'SMTP credentials not configured' })
  }

  const body = await readBody<{ emails?: string[] }>(event)
  const emails = Array.from(new Set(
    (body?.emails ?? [])
      .map(e => String(e).trim().toLowerCase())
      .filter(Boolean)
  ))

  if (emails.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No test emails provided' })
  }
  if (emails.length > MAX_TEST_RECIPIENTS) {
    throw createError({ statusCode: 400, statusMessage: `Max ${MAX_TEST_RECIPIENTS} test recipients` })
  }
  const invalid = emails.find(e => !EMAIL_RE.test(e) || e.length > 254)
  if (invalid) {
    throw createError({ statusCode: 400, statusMessage: `Invalid email: ${invalid}` })
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (!campaign.templateHtml) throw createError({ statusCode: 400, statusMessage: 'No template HTML set' })

  // If a test email matches an existing contact, use its data for variables
  const contactRows = await db.select().from(contacts).where(inArray(contacts.email, emails))
  const contactMap = new Map(contactRows.map(c => [c.email.toLowerCase(), c]))

  const dkim = (config.dkimDomain && config.dkimSelector && config.dkimPrivateKey) ? {
    domainName: String(config.dkimDomain),
    keySelector: String(config.dkimSelector),
    privateKey: String(config.dkimPrivateKey).replace(/\\n/g, '\n'),
  } : undefined

  const transporter = nodemailer.createTransport({
    host: String(smtpHost),
    port: Number(smtpPort),
    secure: Boolean(smtpSecure),
    auth: { user: String(smtpUser), pass: String(smtpPass) },
    dkim,
  } as any)

  const compiledHtml = compileTemplate(campaign.templateHtml)
  const compiledSubject = compileTemplate(campaign.subject || '')
  const senderEmail = String(smtpFromEmail || smtpUser)
  const baseUrl = String(config.trackingBaseUrl || 'http://localhost:3000')

  const results: { email: string; ok: boolean; error?: string }[] = []

  for (const email of emails) {
    const contact = contactMap.get(email)
    const vars = contact ?? { email }

    const subject = `[TEST] ${compiledSubject.applyTo(vars) || campaign.name}`
    // Neutralize unsubscribe/preferences placeholders — no real send record exists
    const html = compiledHtml.applyTo(vars)
      .replace(/\{\{\s*UNSUBSCRIBE_URL\s*\}\}/gi, baseUrl)
      .replace(/\{\{\s*PREFERENCES_URL\s*\}\}/gi, baseUrl)
    const text = htmlToText(html)

    try {
      await sendWithRetry(transporter, {
        from: `"${String(smtpFromName || 'TurboMailer')}" <${senderEmail}>`,
        to: email,
        subject,
        html,
        text,
      }, 1, 0)
      results.push({ email, ok: true })
    } catch (err: any) {
      results.push({ email, ok: false, error: err?.message || 'Send failed' })
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
