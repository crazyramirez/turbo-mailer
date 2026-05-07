import { ImapFlow } from 'imapflow'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '~/server/db/index'
import { sends, contacts, campaigns } from '~/server/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { useServerConfig, dataDir } from './serverConfig'

function blog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  console.log(msg)
  try {
    appendFileSync(resolve(dataDir, 'bounce.log'), line, 'utf-8')
  } catch {}
}

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
    blog(`[bounce] START host=${cfg.host} port=${cfg.port} user=${cfg.user} tls=${cfg.tls}`)
    blog(`[bounce] connecting...`)
    await client.connect()
    await client.mailboxOpen('INBOX')
    blog('[bounce] INBOX opened')

    // IMAP is serial — run searches one at a time with individual timeouts.
    // Promise.all on one connection causes Gmail IMAP to deadlock.
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const safeSearch = async (criteria: Record<string, unknown>, label: string): Promise<number[]> => {
      blog(`[bounce] search: ${label}`)
      try {
        const result = await Promise.race<number[] | false>([
          client.search(criteria),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error(`timeout: ${label}`)), 20_000)
          ),
        ])
        const uids = Array.isArray(result) ? result : []
        blog(`[bounce] search "${label}": ${uids.length} hit(s)`)
        return uids
      } catch (e: any) {
        blog(`[bounce] search "${label}" SKIP: ${e.message}`)
        return []
      }
    }

    const s1 = await safeSearch({ from: 'mailer-daemon', since }, 'from:mailer-daemon')
    const s2 = await safeSearch({ from: 'postmaster', since }, 'from:postmaster')
    const s3 = await safeSearch({ subject: 'Undelivered', since }, 'subject:Undelivered')
    const s4 = await safeSearch({ subject: 'Delivery Status', since }, 'subject:Delivery Status')

    const uidSet = [...new Set([...s1, ...s2, ...s3, ...s4])]
    blog(`[bounce] UIDs total: ${uidSet.length} (s1=${s1.length} s2=${s2.length} s3=${s3.length} s4=${s4.length})`)

    if (!uidSet.length) {
      await client.logout()
      return { checked: 0, bounced: 0, errors: [] }
    }

    const allBounces = new Map<string, ParsedBounce>()

    for await (const msg of client.fetch(uidSet, { source: true }, { uid: true })) {
      checked++
      if (!msg.source) continue
      try {
        const parsed = parseBounces(msg.source)
        blog(`[bounce] UID ${msg.uid}: ${parsed.length} bounce(s)`)
        for (const b of parsed) {
          blog(`[bounce]   → ${b.email} permanent=${b.permanent} status=${b.statusCode}`)
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
    blog(`[bounce] done: checked=${checked} bounced=${bounced} errors=${errors.length}`)
  } catch (e: any) {
    blog(`[bounce] FATAL: ${e.message}`)
    errors.push(e.message)
    try { await client.logout() } catch {}
  }

  return { checked, bounced, errors }
}
