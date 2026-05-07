import { ImapFlow } from 'imapflow'
import { db } from '~/server/db/index'
import { sends, contacts, campaigns } from '~/server/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { useServerConfig } from './serverConfig'

export interface ImapConfig {
  host: string
  port: number
  user: string
  pass: string
  tls: boolean
}

interface ParsedBounce {
  email: string
  statusCode: string
  permanent: boolean
  description: string
}

export function autoDetectImapHost(smtpHost: string): string {
  const h = smtpHost.toLowerCase().trim()
  if (h.includes('gmail') || h.includes('googlemail')) return 'imap.gmail.com'
  if (h.includes('outlook') || h.includes('office365')) return 'outlook.office365.com'
  if (h.includes('hotmail') || h.includes('live.com')) return 'imap-mail.outlook.com'
  if (h.includes('yahoo')) return 'imap.mail.yahoo.com'
  if (h.includes('zoho')) return 'imap.zoho.com'
  if (h.includes('icloud') || h.includes('me.com')) return 'imap.mail.me.com'
  if (h.startsWith('smtp.')) return h.replace('smtp.', 'imap.')
  if (h.startsWith('mail.')) return h
  return h
}

export function getImapConfig(): ImapConfig | null {
  const cfg = useServerConfig()
  const smtpUser = String(cfg.smtpUser || '')
  const smtpPass = String(cfg.smtpPass || '')
  if (!smtpUser || !smtpPass) return null

  const autoDetect = cfg.imapAutoDetect !== false && String(cfg.imapAutoDetect) !== 'false'

  if (autoDetect) {
    const smtpHost = String(cfg.smtpHost || '')
    if (!smtpHost) return null
    return { host: autoDetectImapHost(smtpHost), port: 993, user: smtpUser, pass: smtpPass, tls: true }
  }

  const host = String(cfg.imapHost || '')
  if (!host) return null
  return {
    host,
    port: Number(cfg.imapPort || 993),
    user: String(cfg.imapUser || smtpUser),
    pass: String(cfg.imapPass || smtpPass),
    tls: cfg.imapTls !== false && String(cfg.imapTls) !== 'false',
  }
}

// Parse RFC 3464 Delivery Status Notification from raw email buffer
function parseBounces(raw: Buffer): ParsedBounce[] {
  const text = raw.toString('utf-8')
  const bounces: ParsedBounce[] = []

  if (!text.includes('Final-Recipient') || !/Action:\s*failed/i.test(text)) return bounces

  // Split on double blank lines — each block is a per-recipient DSN group
  const blocks = text.split(/(?:\r?\n){2,}/)

  for (const block of blocks) {
    if (!/Final-Recipient/i.test(block)) continue
    if (!/Action:\s*failed/i.test(block)) continue

    const emailM  = /Final-Recipient\s*:\s*(?:rfc822\s*;\s*)?([^\r\n]+)/i.exec(block)
    const statusM = /Status\s*:\s*(\d\.\d+\.\d+)/i.exec(block)
    const diagM   = /Diagnostic-Code\s*:[^\r\n;]*;\s*([^\r\n]+)/i.exec(block)

    if (!emailM) continue
    const email = emailM[1].trim().toLowerCase().replace(/[<>\s]/g, '')
    if (!email.includes('@') || !email.includes('.')) continue

    const statusCode  = statusM?.[1] ?? '5.0.0'
    const description = (diagM?.[1]?.trim() ?? `SMTP bounce ${statusCode}`).slice(0, 250)

    bounces.push({ email, statusCode, permanent: statusCode.startsWith('5.'), description })
  }

  return bounces
}

export async function processBounces(cfg: ImapConfig): Promise<{
  checked: number
  bounced: number
  errors: string[]
}> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 5000,
  } as any)

  let checked = 0
  let bounced = 0
  const errors: string[] = []

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // Multiple searches — NDR senders and common subjects
    const toArr = (r: number[] | false): number[] => Array.isArray(r) ? r : []

    // No `seen: false` — NDR could be already read by the user.
    // Limit to last 30 days to avoid scanning entire inbox history.
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const [s1, s2, s3, s4] = await Promise.all([
      client.search({ from: 'mailer-daemon', since }).then(toArr).catch(() => [] as number[]),
      client.search({ from: 'postmaster', since }).then(toArr).catch(() => [] as number[]),
      client.search({ subject: 'Undelivered', since }).then(toArr).catch(() => [] as number[]),
      client.search({ subject: 'Delivery Status', since }).then(toArr).catch(() => [] as number[]),
    ])

    const uidSet = [...new Set([...s1, ...s2, ...s3, ...s4])]
    if (!uidSet.length) {
      await client.logout()
      return { checked: 0, bounced: 0, errors: [] }
    }

    const allBounces = new Map<string, ParsedBounce>()

    for await (const msg of client.fetch(uidSet, { source: true }, { uid: true })) {
      checked++
      if (!msg.source) continue
      try {
        for (const b of parseBounces(msg.source)) {
          allBounces.set(b.email, b)
        }
      } catch (e: any) {
        errors.push(`UID ${msg.uid}: ${e.message}`)
      }
    }

    if (allBounces.size > 0) {
      const emailList = [...allBounces.keys()]

      const affected = await db
        .select({
          id:         sends.id,
          campaignId: sends.campaignId,
          contactId:  sends.contactId,
          email:      sends.email,
          status:     sends.status,
        })
        .from(sends)
        .where(inArray(sends.email, emailList))

      // Only update sends that are currently 'sent' or 'opened' (not already marked failed/bounced)
      const toUpdate = affected.filter(s => s.status === 'sent' || s.status === 'opened')
      const affectedCampaigns = new Set<number>()

      for (const send of toUpdate) {
        const b = allBounces.get(send.email.toLowerCase())!
        await db.update(sends).set({
          status:   b.permanent ? 'bounced' : 'failed',
          errorMsg: b.description,
        }).where(eq(sends.id, send.id))

        if (b.permanent && send.contactId) {
          await db.update(contacts)
            .set({ status: 'bounced', updatedAt: new Date() })
            .where(eq(contacts.id, send.contactId))
        }

        affectedCampaigns.add(send.campaignId)
        bounced++
      }

      // Recalculate stats for every affected campaign
      for (const cid of affectedCampaigns) {
        const all = await db.select({ status: sends.status }).from(sends).where(eq(sends.campaignId, cid))
        await db.update(campaigns).set({
          sentCount: all.filter(s => ['sent', 'opened'].includes(s.status)).length,
          failCount: all.filter(s => ['failed', 'bounced'].includes(s.status)).length,
          openCount: all.filter(s => s.status === 'opened').length,
        }).where(eq(campaigns.id, cid))
      }
    }

    await client.logout()
  } catch (e: any) {
    errors.push(e.message)
    try { await client.logout() } catch {}
  }

  return { checked, bounced, errors }
}
