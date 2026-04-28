import nodemailer from 'nodemailer'
import { db } from '~/server/db/index'
import { campaigns, contacts, listContacts, sends } from '~/server/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { applyVars } from '~/server/utils/template'
import { signUnsubscribeToken, signClickToken, signOpenToken } from '~/server/utils/auth'

export interface SendConfig {
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
  jitterMs: number
  maxRetries: number
  retryDelayMs: number
}

export function injectTracking(html: string, sendId: number, baseUrl: string, secret: string): string {
  let linkCount = 0
  const tracked = html.replace(
    /<a\s+([^>]*?)href=(["'])((?:https?:\/\/|www\.)[^"']+)\2([^>]*?)>/gi,
    (_match, pre, _quote, url, post) => {
      linkCount++
      const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`
      const sig = signClickToken(sendId, fullUrl, secret)
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

export async function sendWithRetry(
  transporter: nodemailer.Transporter,
  mailOptions: nodemailer.SendMailOptions,
  maxRetries: number,
  retryDelayMs: number
): Promise<void> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await transporter.sendMail(mailOptions)
      return
    } catch (err: any) {
      lastErr = err
      // 5xx SMTP = permanent failure — don't retry
      if (err.responseCode >= 500 && err.responseCode < 600) throw err
      if (attempt < maxRetries - 1) {
        // Exponential backoff or fixed delay? Let's use config delay with a multiplier
        await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

export async function processCampaign(campaignId: number, cfg: SendConfig): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  } as any)

  // Load recipients with pending sends (supports resume and retry)
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

  for (const send of pendingSends) {
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
      }, cfg.maxRetries, cfg.retryDelayMs)

      await db.update(sends).set({
        status: 'sent',
        personalizedSubject,
        sentAt: new Date(),
        errorMsg: null
      }).where(eq(sends.id, send.sendId))
    } catch (err: any) {
      await db.update(sends).set({
        status: 'failed',
        errorMsg: err.message,
        sentAt: new Date(),
      }).where(eq(sends.id, send.sendId))
    }

    if (cfg.delayMs > 0) {
      const jitter = cfg.jitterMs > 0
        ? Math.floor(Math.random() * (cfg.jitterMs * 2)) - cfg.jitterMs
        : 0
      const actualDelay = Math.max(50, cfg.delayMs + jitter)
      await new Promise(r => setTimeout(r, actualDelay))
    }
  }

  // Final stats update based on the sends table
  const allSends = await db.select().from(sends).where(eq(sends.campaignId, campaignId))
  const sentCount = allSends.filter(s => ['sent', 'opened'].includes(s.status)).length
  const failCount = allSends.filter(s => s.status === 'failed').length
  const openCount = allSends.filter(s => s.status === 'opened').length

  const [final] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))

  const updateData: any = {
    sentCount,
    failCount,
    openCount,
  }

  if (final?.status !== 'paused') {
    updateData.status = 'sent'
    updateData.finishedAt = new Date()
  }

  await db.update(campaigns)
    .set(updateData)
    .where(eq(campaigns.id, campaignId))
}
