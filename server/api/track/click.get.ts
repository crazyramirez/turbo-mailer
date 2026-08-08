import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, sql, and, gt } from 'drizzle-orm'
import { verifyClickTokenDetailed } from '~/server/utils/auth'
import { emitWebhook } from '~/server/utils/webhook'
import { classifyClick } from '~/server/utils/bot-detect'

// In-memory lock to prevent race conditions from rapid-fire mobile clicks
const clickLock = new Set<string>()

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sendId = Number(query.s)
  const rawU = String(query.u ?? '')
  // H3 already URL-decodes query params; avoid double-decode by not calling decodeURIComponent again
  const targetUrl = rawU || null
  const sig = String(query.sig ?? '')

  if (!targetUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing target URL' })
  }

  // Defense-in-depth: even with a valid signature, only redirect to http(s)
  if (!/^https?:\/\//i.test(targetUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid target URL scheme' })
  }

  const config = useServerConfig()
  const tokenStatus = verifyClickTokenDetailed(sendId, targetUrl, sig, config.unsubscribeSecret as string)
  if (tokenStatus === 'invalid') {
    throw createError({ statusCode: 403, statusMessage: 'Invalid link signature' })
  }
  // Authentic but past TTL: still honor the redirect for the recipient,
  // just don't record the click
  if (tokenStatus === 'expired') {
    return await sendRedirect(event, targetUrl, 302)
  }

  if (sendId) {
    try {
      const ua = getHeader(event, 'user-agent') || ''
      const accept = getHeader(event, 'accept') || ''
      if (classifyClick(ua, accept) === 'bot') {
        console.log('[track/click] bot/scanner ignored ua=%s', ua.slice(0, 80))
        return await sendRedirect(event, targetUrl, 302)
      }

      const ip = String(getHeader(event, 'x-forwarded-for') || getHeader(event, 'x-real-ip') || 'unknown').split(',')[0].trim()
      
      // 1. Memory debounce (handles race conditions better than DB check alone)
      const lockKey = `${sendId}:${targetUrl}:${ip}`
      if (clickLock.has(lockKey)) {
        console.log('[track/click] debounce memory-lock hit for %s', lockKey)
        return await sendRedirect(event, targetUrl, 302)
      }
      clickLock.add(lockKey)
      setTimeout(() => clickLock.delete(lockKey), 2000)

      // Synchronous transaction (better-sqlite3): dedup check, unique-clicker
      // check, event insert and counter increments are atomic — no await
      // boundaries where a concurrent click on another link of the same send
      // could double-count
      const recorded = db.transaction((tx) => {
        // 2. DB Deduplication (backup)
        const fiveSecondsAgo = new Date(Date.now() - 5000)
        const existing = tx.select({ id: trackingEvents.id })
          .from(trackingEvents)
          .where(and(
            eq(trackingEvents.sendId, sendId),
            eq(trackingEvents.eventType, 'click'),
            eq(trackingEvents.url, targetUrl),
            eq(trackingEvents.ip, ip),
            gt(trackingEvents.createdAt, fiveSecondsAgo)
          ))
          .limit(1)
          .get()
        if (existing) return null

        const send = tx.select().from(sends).where(eq(sends.id, sendId)).get()
        if (!send) return null

        // campaigns.clickCount counts recipients who clicked (like openCount),
        // not total click events — increment only on this send's first click
        const priorClick = tx.select({ id: trackingEvents.id })
          .from(trackingEvents)
          .where(and(
            eq(trackingEvents.sendId, sendId),
            eq(trackingEvents.eventType, 'click')
          ))
          .limit(1)
          .get()

        tx.insert(trackingEvents).values({
          sendId,
          campaignId: send.campaignId,
          contactId: send.contactId,
          eventType: 'click',
          url: targetUrl,
          ip,
          userAgent: ua,
          createdAt: new Date(),
        }).run()

        if (!priorClick) {
          tx.update(campaigns)
            .set({ clickCount: sql`${campaigns.clickCount} + 1` })
            .where(eq(campaigns.id, send.campaignId))
            .run()
        }

        // A click is the strongest possible proof of a human: relays prefetch
        // images, not links. It both implies an open and confirms one that so
        // far had only proxy evidence.
        const wasUnopened = send.status === 'sent'
        const isFirstHumanProof = wasUnopened || send.openedByProxy === true

        if (wasUnopened) {
          tx.update(sends)
            .set({ status: 'opened', openedByProxy: false })
            .where(and(eq(sends.id, sendId), eq(sends.status, 'sent')))
            .run()

          tx.update(campaigns)
            .set({ openCount: sql`${campaigns.openCount} + 1` })
            .where(eq(campaigns.id, send.campaignId))
            .run()
        }

        if (isFirstHumanProof) {
          tx.update(sends)
            .set({ openedByProxy: false })
            .where(eq(sends.id, sendId))
            .run()

          tx.update(campaigns)
            .set({ confirmedOpenCount: sql`${campaigns.confirmedOpenCount} + 1` })
            .where(eq(campaigns.id, send.campaignId))
            .run()
        }

        return { campaignId: send.campaignId, contactId: send.contactId, email: send.email }
      })

      if (recorded) {
        emitWebhook('email.clicked', { sendId, url: targetUrl, ...recorded })
      }
    } catch (err) {
      console.error('[track/click] error:', err)
    }
  }

  await sendRedirect(event, targetUrl, 302)
})


