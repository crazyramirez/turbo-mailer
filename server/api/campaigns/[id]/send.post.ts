import nodemailer from 'nodemailer'
import { db } from '~/server/db/index'
import { campaigns, contacts, listContacts, sends } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { applyVars } from '~/server/utils/template'


function injectTracking(html: string, sendId: number, campaignId: number, baseUrl: string): string {
  // Wrap links with click tracking
  const tracked = html.replace(
    /<a\s+([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/gi,
    (_match, pre, url, post) => {
      const trackUrl = `${baseUrl}/api/track/click?s=${sendId}&u=${encodeURIComponent(url)}`
      return `<a ${pre}href="${trackUrl}"${post}>`
    }
  )

  // Inject open pixel before </body>
  const pixel = `<img src="${baseUrl}/api/track/open?s=${sendId}&c=${campaignId}" width="1" height="1" border="0" style="width:1px;height:1px;overflow:hidden;position:absolute;" alt="" />`
  return tracked.includes('</body>')
    ? tracked.replace('</body>', `${pixel}</body>`)
    : tracked + pixel
}

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useRuntimeConfig()
  const baseUrl = config.trackingBaseUrl || 'http://localhost:3000'

  const {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpSecure,
    smtpFromName,
    smtpFromEmail
  } = config

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw createError({ statusCode: 500, statusMessage: 'SMTP credentials not configured' })
  }

  // Load campaign
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Already sending' })
  if (!campaign.templateHtml) throw createError({ statusCode: 400, statusMessage: 'No template HTML set' })

  // Load recipients from list
  let recipientRows: typeof contacts.$inferSelect[] = []
  if (campaign.listId) {
    recipientRows = await db.select({ contacts })
      .from(contacts)
      .innerJoin(listContacts, and(
        eq(listContacts.contactId, contacts.id),
        eq(listContacts.listId, campaign.listId)
      ))
      .where(eq(contacts.status, 'active'))
      .then(r => r.map(x => x.contacts))
  }

  if (recipientRows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No active recipients in list' })
  }

  // Mark campaign as sending
  await db.update(campaigns).set({
    status: 'sending',
    startedAt: new Date(),
    totalRecipients: recipientRows.length,
    sentCount: 0,
    failCount: 0,
    openCount: 0,
    clickCount: 0,
  }).where(eq(campaigns.id, campaignId))

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  let sentCount = 0
  let failCount = 0

  for (const contact of recipientRows) {
    // Create send record first to get the ID for tracking
    const [sendRow] = await db.insert(sends).values({
      campaignId,
      contactId: contact.id,
      email: contact.email,
      personalizedSubject: null,
      status: 'pending',
    }).returning()

    try {
      const personalizedSubject = applyVars(campaign.subject, contact)
      // Apply UNSUBSCRIBE_URL after tracking injection so it bypasses click tracking
      const trackedHtml = injectTracking(
        applyVars(campaign.templateHtml, contact),
        sendRow.id,
        campaignId,
        baseUrl
      )
      const unsubscribeUrl = `${baseUrl}/unsubscribe?s=${sendRow.id}`
      const personalizedHtml = trackedHtml.replace(/\{\{\s*UNSUBSCRIBE_URL\s*\}\}/gi, unsubscribeUrl)

      const senderEmail = smtpFromEmail || smtpUser
      await transporter.sendMail({
        from: `"${smtpFromName}" <${senderEmail}>`,
        to: contact.email,
        subject: personalizedSubject,
        html: personalizedHtml,
      })

      await db.update(sends).set({
        status: 'sent',
        personalizedSubject,
        sentAt: new Date(),
      }).where(eq(sends.id, sendRow.id))

      sentCount++
    } catch (err: any) {
      await db.update(sends).set({
        status: 'failed',
        errorMsg: err.message,
        sentAt: new Date(),
      }).where(eq(sends.id, sendRow.id))
      failCount++
    }
  }

  // Mark campaign as sent
  await db.update(campaigns).set({
    status: 'sent',
    finishedAt: new Date(),
    sentCount,
    failCount,
  }).where(eq(campaigns.id, campaignId))

  return { sentCount, failCount, total: recipientRows.length }
})
