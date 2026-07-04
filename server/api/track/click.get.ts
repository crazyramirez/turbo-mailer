import { db } from '~/server/db/index'
import { sends, campaigns, trackingEvents } from '~/server/db/schema'
import { eq, sql, and, gt } from 'drizzle-orm'
import { verifyClickToken } from '~/server/utils/auth'

// In-memory lock to prevent race conditions from rapid-fire mobile clicks
const clickLock = new Set<string>()

// Email security scanners (SafeLinks, Proofpoint, Barracuda, etc.) pre-fetch all links.
// They have no Accept: text/html header and often have telltale UAs.
// We redirect them silently without counting the click.
const BOT_UA_PATTERN = /SafeLinks|UrlScan|LinkScan|Microsoft.*Security|Barracuda|Mimecast|Proofpoint|Symantec|Sophos|IronPort|MessageLabs|MSRBOT|TrendMicro|Forcepoint|Cisco.*Email|ZeroFOX|Agari|Abnormal|Avanan|Tessian|Inky|GreatHorn|MailMarshal|MimeCast|Hornetsecurity|SpamTitan|AppRiver|Cloudmark|Postini|McAfee.*Email|Webroot|SolarWinds|Vade/i

function isBot(ua: string, accept: string): boolean {
  if (!ua) return true
  if (BOT_UA_PATTERN.test(ua)) return true
  // Real browsers always send Accept with text/html; scanners often send */* or nothing
  if (accept && !accept.includes('text/html') && !accept.includes('text/*')) return true
  return false
}

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
  if (!verifyClickToken(sendId, targetUrl, sig, config.unsubscribeSecret as string)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid link signature' })
  }

  if (sendId) {
    try {
      const ua = getHeader(event, 'user-agent') || ''
      const accept = getHeader(event, 'accept') || ''
      if (isBot(ua, accept)) {
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

      // 2. DB Deduplication (backup)
      const fiveSecondsAgo = new Date(Date.now() - 5000)
      const [existing] = await db.select()
        .from(trackingEvents)
        .where(and(
          eq(trackingEvents.sendId, sendId),
          eq(trackingEvents.eventType, 'click'),
          eq(trackingEvents.url, targetUrl),
          eq(trackingEvents.ip, ip),
          gt(trackingEvents.createdAt, fiveSecondsAgo)
        ))
        .limit(1)

      if (!existing) {
        const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
        if (send) {
          await db.insert(trackingEvents).values({
            sendId,
            campaignId: send.campaignId,
            contactId: send.contactId,
            eventType: 'click',
            url: targetUrl,
            ip,
            userAgent: ua,
            createdAt: new Date(),
          })

          await db.update(campaigns)
            .set({ clickCount: sql`${campaigns.clickCount} + 1` })
            .where(eq(campaigns.id, send.campaignId))
          
          if (send.status === 'sent') {
            const [marked] = await db.update(sends)
              .set({ status: 'opened' })
              .where(and(eq(sends.id, sendId), eq(sends.status, 'sent')))
              .returning({ id: sends.id })

            if (marked) {
              await db.update(campaigns)
                .set({ openCount: sql`${campaigns.openCount} + 1` })
                .where(eq(campaigns.id, send.campaignId))
            }
          }
        }
      }
    } catch (err) {
      console.error('[track/click] error:', err)
    }
  }

  await sendRedirect(event, targetUrl, 302)
})


