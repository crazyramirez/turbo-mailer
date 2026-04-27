import nodemailer from 'nodemailer'
import { db } from '~/server/db/index'
import { campaigns, contacts, listContacts, sends } from '~/server/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { applyVars } from '~/server/utils/template'
import { signUnsubscribeToken, signClickToken, signOpenToken } from '~/server/utils/auth'

const MAX_SEND_RETRIES = 3
const RETRY_BASE_DELAY_MS = 5_000

function injectTracking(html: string, sendId: number, baseUrl: string, secret: string): string {
  let linkCount = 0
  // Sign each click URL with HMAC so the redirect cannot be abused for open redirects
  // Matches https?:// and bare www. URLs, both single and double quoted
  const tracked = html.replace(
    /<a\s+([^>]*?)href=(["'])((?:https?:\/\/|www\.)[^"']+)\2([^>]*?)>/gi,
    (_match, pre, _quote, url, post) => {
      linkCount++
      // Auto-add https:// for bare www. URLs
      const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`
      const sig = signClickToken(sendId, fullUrl, secret)
      // Use &amp; for valid HTML; browsers decode it back to & before the request
      const trackUrl = `${baseUrl}/api/track/click?s=${sendId}&amp;u=${encodeURIComponent(fullUrl)}&amp;sig=${sig}`
      return `<a ${pre}href="${trackUrl}"${post}>`
    }
  )
  console.log('[injectTracking] sendId=%s found %d trackable links', sendId, linkCount)

  const openSig = signOpenToken(sendId, secret)
  const pixel = `<img src="${baseUrl}/api/track/open?s=${sendId}&sig=${openSig}" width="1" height="1" border="0" style="width:1px;height:1px;overflow:hidden;position:absolute;" alt="" />`
  return tracked.includes('</body>')
    ? tracked.replace('</body>', `${pixel}</body>`)
    : tracked + pixel
}

async function sendWithRetry(
  transporter: nodemailer.Transporter,
  mailOptions: nodemailer.SendMailOptions,
): Promise<void> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < MAX_SEND_RETRIES; attempt++) {
    try {
      await transporter.sendMail(mailOptions)
      return
    } catch (err: any) {
      lastErr = err
      // 5xx SMTP = permanent failure — don't retry
      if (err.responseCode >= 500 && err.responseCode < 600) throw err
      if (attempt < MAX_SEND_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

interface SendConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpSecure: boolean
  smtpFromName: string
  smtpFromEmail: string
  baseUrl: string
  secret: string
  delayMs: number
}

async function processCampaign(campaignId: number, cfg: SendConfig): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  } as any)

  // Load recipients with pending sends (supports resume from pause)
  const pendingSends = await db
    .select({ sendId: sends.id, contactId: sends.contactId, email: sends.email })
    .from(sends)
    .where(and(eq(sends.campaignId, campaignId), eq(sends.status, 'pending')))

  if (pendingSends.length === 0) {
    await db.update(campaigns)
      .set({ status: 'sent', finishedAt: new Date() })
      .where(eq(campaigns.id, campaignId))
    return
  }

  const contactIds = pendingSends.map(s => s.contactId).filter(Boolean) as number[]
  const contactMap = new Map<number, typeof contacts.$inferSelect>()
  if (contactIds.length) {
    const rows = await db.select().from(contacts).where(inArray(contacts.id, contactIds))
    rows.forEach(c => contactMap.set(c.id, c))
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign?.templateHtml) return

  let sentDelta = 0
  let failDelta = 0

  for (const send of pendingSends) {
    // Pause check — re-read status from DB each iteration
    const [current] = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
    if (current?.status === 'paused') break

    const contact = send.contactId ? contactMap.get(send.contactId) : null
    const vars = contact ?? { email: send.email }

    try {
      const personalizedSubject = applyVars(campaign.subject, vars)
      const trackedHtml = injectTracking(
        applyVars(campaign.templateHtml, vars),
        send.sendId,
        cfg.baseUrl,
        cfg.secret,
      )
      const unsubToken = signUnsubscribeToken(send.sendId, cfg.secret)
      const personalizedHtml = trackedHtml.replace(
        /\{\{\s*UNSUBSCRIBE_URL\s*\}\}/gi,
        `${cfg.baseUrl}/unsubscribe?s=${send.sendId}&t=${unsubToken}`
      )

      const senderEmail = cfg.smtpFromEmail || cfg.smtpUser
      await sendWithRetry(transporter, {
        from: `"${cfg.smtpFromName}" <${senderEmail}>`,
        to: send.email,
        subject: personalizedSubject,
        html: personalizedHtml,
      })

      await db.update(sends).set({
        status: 'sent',
        personalizedSubject,
        sentAt: new Date(),
      }).where(eq(sends.id, send.sendId))
      sentDelta++
    } catch (err: any) {
      await db.update(sends).set({
        status: 'failed',
        errorMsg: err.message,
        sentAt: new Date(),
      }).where(eq(sends.id, send.sendId))
      failDelta++
    }

    if (cfg.delayMs > 0) await new Promise(r => setTimeout(r, cfg.delayMs))
  }

  // Check final status
  const [final] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  if (final?.status !== 'paused') {
    await db.update(campaigns).set({
      status: 'sent',
      finishedAt: new Date(),
      sentCount: (campaign.sentCount ?? 0) + sentDelta,
      failCount: (campaign.failCount ?? 0) + failDelta,
    }).where(eq(campaigns.id, campaignId))
  } else {
    // Update counts even if paused
    await db.update(campaigns).set({
      sentCount: (campaign.sentCount ?? 0) + sentDelta,
      failCount: (campaign.failCount ?? 0) + failDelta,
    }).where(eq(campaigns.id, campaignId))
  }
}

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const config = useRuntimeConfig()

  const {
    smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure,
    smtpFromName, smtpFromEmail,
  } = config

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw createError({ statusCode: 500, statusMessage: 'SMTP credentials not configured' })
  }

  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId))
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (campaign.status === 'sending') throw createError({ statusCode: 409, statusMessage: 'Already sending' })
  if (!campaign.templateHtml) throw createError({ statusCode: 400, statusMessage: 'No template HTML set' })

  // Load recipients from list (only on initial send, not resume)
  if (campaign.status !== 'paused') {
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

    // Create send records
    await db.insert(sends).values(
      recipientRows.map(c => ({
        campaignId,
        contactId: c.id,
        email: c.email,
        personalizedSubject: null,
        status: 'pending' as const,
      }))
    )

    await db.update(campaigns).set({
      status: 'sending',
      startedAt: new Date(),
      totalRecipients: recipientRows.length,
      sentCount: 0,
      failCount: 0,
      openCount: 0,
      clickCount: 0,
    }).where(eq(campaigns.id, campaignId))
  } else {
    // Resume
    await db.update(campaigns)
      .set({ status: 'sending' })
      .where(eq(campaigns.id, campaignId))
  }

  const cfg: SendConfig = {
    smtpHost: String(smtpHost),
    smtpPort: Number(smtpPort),
    smtpUser: String(smtpUser),
    smtpPass: String(smtpPass),
    smtpSecure: Boolean(smtpSecure),
    smtpFromName: String(smtpFromName || 'TurboMailer'),
    smtpFromEmail: String(smtpFromEmail || smtpUser),
    baseUrl: String(config.trackingBaseUrl || 'http://localhost:3000'),
    secret: String(config.unsubscribeSecret),
    delayMs: Number(process.env.SMTP_SEND_DELAY_MS ?? 200),
  }

  // Process in background — respond immediately so the browser doesn't wait
  processCampaign(campaignId, cfg).catch(async (err) => {
    console.error(`[campaign-send] campaignId=${campaignId} fatal error:`, err)
    // Mark as paused so the user can see it failed and retry from the UI
    await db.update(campaigns)
      .set({ status: 'paused' })
      .where(eq(campaigns.id, campaignId))
      .catch(() => {})
  })

  return { queued: true, campaignId, sentCount: 0, failCount: 0 }
})
