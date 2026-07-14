import nodemailer from 'nodemailer'
import { db, sqlite } from '~/server/db/index'
import { campaigns, contacts, sends } from '~/server/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { compileTemplate } from '~/server/utils/template'
import { signUnsubscribeToken, signClickToken, signOpenToken } from '~/server/utils/auth'
import { getImapConfig, processBounces } from '~/server/utils/bounce-processor'
import { isPaused, clearSignal } from '~/server/utils/campaign-state'
import { userFriendlySmtpError } from '~/server/utils/errors'
import { htmlToText } from '~/server/utils/html-to-text'

const COUNTER_FLUSH_EVERY = 1

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
  maxEmailsPerSecond: number
  dkimDomain?: string
  dkimSelector?: string
  dkimPrivateKey?: string
}

export function injectTracking(html: string, sendId: number, baseUrl: string, secret: string): string {
  let linkCount = 0
  const tracked = html.replace(
    /<a\s+([^>]*?)href=(["'])((?:https?:\/\/|www\.)[^"'\s]+)\2([^>]*?)>/gi,
    (_match, pre, _quote, url, post) => {
      linkCount++
      // Editors emit HTML-entity-encoded hrefs (&amp;); decode so the signed
      // URL matches the real destination and the redirect isn't malformed
      const decodedUrl = url.replace(/&amp;/g, '&')
      const fullUrl = /^https?:\/\//i.test(decodedUrl) ? decodedUrl : `https://${decodedUrl}`
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
): Promise<nodemailer.SentMessageInfo> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions)
      
      // Check if the recipient was rejected even if the SMTP server returned 250 OK
      if (info.rejected && info.rejected.length > 0) {
        const err = new Error(`Recipient rejected by SMTP server: ${info.rejected.join(', ')}`)
        // Assign a mock 550 code to trigger hard bounce logic if it looks like a permanent block
        ;(err as any).responseCode = 550 
        throw err
      }
      
      return info
    } catch (err: any) {
      lastErr = err
      // 5xx SMTP = permanent failure — don't retry
      if (err.responseCode >= 500 && err.responseCode < 600) throw err
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)))
      }
    }
  }
  throw lastErr
}

export async function processCampaign(campaignId: number, cfg: SendConfig): Promise<void> {
  // Clear any leftover pause signal from prior cycle
  clearSignal(campaignId)

  const dkim = (cfg.dkimDomain && cfg.dkimSelector && cfg.dkimPrivateKey) ? {
    domainName: cfg.dkimDomain,
    keySelector: cfg.dkimSelector,
    privateKey: cfg.dkimPrivateKey.replace(/\\n/g, '\n'),
  } : undefined

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    dkim,
  } as any)

  // Load recipients with pending sends (supports resume and retry)
  const pendingSends = await db
    .select({ sendId: sends.id, contactId: sends.contactId, email: sends.email, variant: sends.variant })
    .from(sends)
    .where(and(eq(sends.campaignId, campaignId), eq(sends.status, 'pending')))

  if (pendingSends.length === 0) {
    // A/B holdout still waiting for its winner? Re-enter the waiting phase
    // (covers pause→resume while the sample-phase timer was running)
    const [held] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sends)
      .where(and(eq(sends.campaignId, campaignId), eq(sends.status, 'held')))
    if ((held?.count ?? 0) > 0) {
      await db.update(campaigns)
        .set({ status: 'sending', abPhase: 'waiting' })
        .where(eq(campaigns.id, campaignId))
      return
    }
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

  // A5: Compile template and subject once — not per email
  const compiledHtml = compileTemplate(campaign.templateHtml)
  const compiledSubject = compileTemplate(campaign.subject)
  // A/B: variant-B sample sends use subjectB; the final wave (variant null)
  // uses whichever subject won the sample phase
  const compiledSubjectB = campaign.subjectB ? compileTemplate(campaign.subjectB) : null
  const winnerSubject = (campaign.abWinner === 'B' && compiledSubjectB) ? compiledSubjectB : compiledSubject

  // A6: Batch campaign counter flushes every COUNTER_FLUSH_EVERY emails
  let batchSent = 0
  let batchFail = 0
  const flushCounters = () => {
    if (batchSent === 0 && batchFail === 0) return
    sqlite.transaction(() => {
      if (batchSent > 0) {
        sqlite.prepare('UPDATE campaigns SET sent_count = COALESCE(sent_count, 0) + ? WHERE id = ?').run(batchSent, campaignId)
      }
      if (batchFail > 0) {
        sqlite.prepare('UPDATE campaigns SET fail_count = COALESCE(fail_count, 0) + ? WHERE id = ?').run(batchFail, campaignId)
      }
    })()
    batchSent = 0
    batchFail = 0
  }

  for (const send of pendingSends) {
    // A2: Check in-memory pause signal instead of querying DB per email
    if (isPaused(campaignId)) break

    const contact = send.contactId ? contactMap.get(send.contactId) : null
    const vars = contact ?? { email: send.email }

    try {
      const subjectTpl = send.variant === 'B' && compiledSubjectB
        ? compiledSubjectB
        : send.variant === 'A' ? compiledSubject : winnerSubject
      const personalizedSubject = subjectTpl.applyTo(vars)
      const trackedHtml = injectTracking(
        compiledHtml.applyTo(vars),
        send.sendId,
        cfg.baseUrl,
        cfg.secret,
      )
      const senderEmail = cfg.smtpFromEmail || cfg.smtpUser
      const unsubToken = signUnsubscribeToken(send.sendId, cfg.secret)
      const unsubUrl = `${cfg.baseUrl}/unsubscribe?s=${send.sendId}&t=${unsubToken}`
      const prefUrl = `${cfg.baseUrl}/preferences?s=${send.sendId}&t=${unsubToken}`
      const personalizedHtml = trackedHtml
        .replace(/\{\{\s*UNSUBSCRIBE_URL\s*\}\}/gi, unsubUrl)
        .replace(/\{\{\s*PREFERENCES_URL\s*\}\}/gi, prefUrl)

      // Plain-text alternative from the untracked HTML (no pixel/click-wrapped URLs),
      // with the real unsubscribe link appended — better spam score than HTML-only.
      const plainText = htmlToText(
        compiledHtml.applyTo(vars)
          .replace(/\{\{\s*UNSUBSCRIBE_URL\s*\}\}/gi, unsubUrl)
          .replace(/\{\{\s*PREFERENCES_URL\s*\}\}/gi, prefUrl)
      ) + `\n\n--\nUnsubscribe: ${unsubUrl}`

      await sendWithRetry(transporter, {
        from: `"${cfg.smtpFromName}" <${senderEmail}>`,
        to: send.email,
        subject: personalizedSubject,
        html: personalizedHtml,
        text: plainText,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      }, cfg.maxRetries, cfg.retryDelayMs)

      await db.update(sends).set({
        status: 'sent',
        personalizedSubject,
        sentAt: new Date(),
        errorMsg: null
      }).where(eq(sends.id, send.sendId))

      batchSent++

      // Reset failCount on successful send
      if (send.contactId) {
        await db.update(contacts).set({ failCount: 0 }).where(eq(contacts.id, send.contactId))
      }
    } catch (err: any) {
      const isHardBounce = err.responseCode >= 500 && err.responseCode < 600
      const status = isHardBounce ? 'bounced' : 'failed'
      const { message: friendlyMsg } = userFriendlySmtpError(err)

      await db.update(sends).set({
        status,
        errorMsg: friendlyMsg,
        sentAt: new Date(),
      }).where(eq(sends.id, send.sendId))

      batchFail++

      if (isHardBounce && send.contactId) {
        await db.update(contacts).set({
          status: 'bounced',
          updatedAt: new Date()
        }).where(eq(contacts.id, send.contactId))
      } else if (!isHardBounce && send.contactId) {
        // A3: Atomic increment — no read-then-write N+1
        await db.update(contacts).set({
          failCount: sql`COALESCE(${contacts.failCount}, 0) + 1`,
          status: sql`CASE WHEN COALESCE(${contacts.failCount}, 0) + 1 >= 5 THEN 'inactive' ELSE ${contacts.status} END`,
          updatedAt: new Date(),
        }).where(eq(contacts.id, send.contactId))
      }
    }

    // A6: Flush campaign counters every COUNTER_FLUSH_EVERY emails
    if ((batchSent + batchFail) % COUNTER_FLUSH_EVERY === 0) flushCounters()

    const minDelayByRate = cfg.maxEmailsPerSecond > 0 ? (1000 / cfg.maxEmailsPerSecond) : 0
    const baseDelay = Math.max(cfg.delayMs || 0, minDelayByRate)

    if (baseDelay > 0) {
      const jitter = cfg.jitterMs > 0
        ? Math.floor(Math.random() * (cfg.jitterMs * 2)) - cfg.jitterMs
        : 0
      const actualDelay = Math.max(50, baseDelay + jitter)
      await new Promise(r => setTimeout(r, actualDelay))
    } else {
      // Small delay when no rate configured — keeps UI progress visible
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // Flush any remaining counters
  flushCounters()

  // A4: SQL COUNT instead of loading all 50k records into memory
  const [stats] = await db
    .select({
      sentCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('sent','opened'))`,
      failCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('failed','bounced'))`,
      openCount: sql<number>`COUNT(*) FILTER (WHERE status = 'opened')`,
      heldCount: sql<number>`COUNT(*) FILTER (WHERE status = 'held')`,
    })
    .from(sends)
    .where(eq(sends.campaignId, campaignId))

  // Check final pause state without reloading all records
  const wasPaused = isPaused(campaignId)

  const updateData: any = {
    sentCount: stats?.sentCount ?? 0,
    failCount: stats?.failCount ?? 0,
    openCount: stats?.openCount ?? 0,
  }

  const abWaiting = !wasPaused && (stats?.heldCount ?? 0) > 0 && campaign.abPhase === 'sample'

  if (abWaiting) {
    // A/B sample done — hold position until the scheduler decides the winner
    const waitMinutes = Math.max(10, Number(campaign.abWaitMinutes) || 240)
    updateData.abPhase = 'waiting'
    updateData.abDecideAt = new Date(Date.now() + waitMinutes * 60_000)
  } else if (!wasPaused) {
    updateData.status = 'sent'
    updateData.finishedAt = new Date()
  }

  await db.update(campaigns)
    .set(updateData)
    .where(eq(campaigns.id, campaignId))

  // Auto-check bounces after campaign ends — NDR emails need time to arrive
  if (!wasPaused && !abWaiting) {
    setTimeout(() => {
      const imapCfg = getImapConfig()
      if (imapCfg) processBounces(imapCfg).catch(() => {})
    }, 15 * 1000)
  }
}
