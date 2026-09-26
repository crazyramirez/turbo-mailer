import type { ParsedMail, Attachment } from 'mailparser'
import { gunzipSync, inflateRawSync } from 'node:zlib'

// Pure parsers for inbound machine mail: delivery status notifications (RFC
// 3464), abuse feedback reports (ARF, RFC 5965) and DMARC aggregate reports
// (RFC 7489). No I/O here — unit-testable with raw fixtures.

export interface DsnRecipient {
  recipient: string
  action: string
  status: string | null
  diagnostic: string | null
}

export interface OriginalRefs {
  tmId: string | null
  messageId: string | null
  to: string | null
}

function attachmentText(a: Attachment): string {
  return Buffer.isBuffer(a.content) ? a.content.toString('utf-8') : String(a.content ?? '')
}

function unfold(headers: string): string {
  return headers.replace(/\r?\n[ \t]+/g, ' ')
}

function headerValue(headers: string, name: string): string | null {
  const m = unfold(headers).match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))
  return m ? m[1].trim() : null
}

function cleanAddress(v: string | null | undefined): string | null {
  if (!v) return null
  const m = v.match(/<([^>]+)>/) ?? v.match(/([^\s;<>"]+@[^\s;<>"]+)/)
  const addr = (m ? m[1] : v).trim().toLowerCase().replace(/^rfc822;\s*/i, '')
  return addr.includes('@') ? addr : null
}

/** Headers of the ORIGINAL message quoted inside a bounce/complaint. */
export function extractOriginalRefs(parsed: ParsedMail): OriginalRefs {
  const candidates: string[] = []
  for (const a of parsed.attachments ?? []) {
    const type = (a.contentType || '').toLowerCase()
    if (type === 'text/rfc822-headers' || type === 'message/rfc822' || type === 'message/rfc822-headers') {
      candidates.push(attachmentText(a))
    }
  }
  // Non-standard NDRs quote the original in the body
  candidates.push(parsed.text ?? '')

  for (const raw of candidates) {
    const headerPart = raw.split(/\r?\n\r?\n/)[0] ?? raw
    const tmId = headerValue(headerPart, 'X-TM-ID') ?? headerValue(raw, 'X-TM-ID')
    const messageId = headerValue(headerPart, 'Message-ID') ?? headerValue(raw, 'Message-ID')
    const to = cleanAddress(headerValue(headerPart, 'To'))
    if (tmId || messageId) {
      return { tmId: tmId?.split(/\s/)[0] ?? null, messageId: messageId?.match(/<[^>]+>/)?.[0] ?? null, to }
    }
  }
  return { tmId: null, messageId: null, to: null }
}

export function parseDeliveryStatus(text: string): DsnRecipient[] {
  const out: DsnRecipient[] = []
  const blocks = unfold(text).split(/\r?\n\s*\r?\n/)
  for (const block of blocks) {
    const final = block.match(/^Final-Recipient:\s*(?:rfc822\s*;\s*)?(.+)$/im)
    const original = block.match(/^Original-Recipient:\s*(?:rfc822\s*;\s*)?(.+)$/im)
    const recipient = cleanAddress(final?.[1] ?? original?.[1])
    if (!recipient) continue
    const action = block.match(/^Action:\s*(\S+)/im)?.[1]?.toLowerCase() ?? ''
    const status = block.match(/^Status:\s*(\d\.\d{1,3}\.\d{1,3})/im)?.[1] ?? null
    const diagnostic = block.match(/^Diagnostic-Code:\s*(?:[a-z0-9-]+\s*;\s*)?(.+)$/im)?.[1]?.trim() ?? null
    out.push({ recipient, action, status, diagnostic })
  }
  return out
}

/** DSN recipients from a parsed message (standard part, or legacy text body). */
export function extractDsn(parsed: ParsedMail): DsnRecipient[] {
  for (const a of parsed.attachments ?? []) {
    const type = (a.contentType || '').toLowerCase()
    if (type === 'message/delivery-status' || type === 'message/global-delivery-status') {
      const rec = parseDeliveryStatus(attachmentText(a))
      if (rec.length) return rec
    }
  }
  // Some MTAs inline the status block in the text body
  const body = parsed.text ?? ''
  if (/Final-Recipient:/i.test(body) && /Action:/i.test(body)) return parseDeliveryStatus(body)
  return []
}

export function looksLikeBounce(parsed: ParsedMail): boolean {
  const from = (parsed.from?.text ?? '').toLowerCase()
  const subject = (parsed.subject ?? '').toLowerCase()
  const contentType = String(parsed.headers.get('content-type') ?? '').toLowerCase()
  return /report-type="?delivery-status/.test(contentType)
    || /mailer-daemon|postmaster|mail delivery (?:subsystem|system)/.test(from)
    || /undeliver|delivery (?:status|failure|has failed)|returned mail|failure notice|non-?delivery|could not be delivered|delivery incomplete/.test(subject)
}

export interface FeedbackReport {
  feedbackType: string
  originalRecipient: string | null
  userAgent: string | null
}

export function extractFeedbackReport(parsed: ParsedMail): FeedbackReport | null {
  for (const a of parsed.attachments ?? []) {
    if ((a.contentType || '').toLowerCase() === 'message/feedback-report') {
      const text = unfold(attachmentText(a))
      return {
        feedbackType: text.match(/^Feedback-Type:\s*(\S+)/im)?.[1]?.toLowerCase() ?? 'abuse',
        originalRecipient: cleanAddress(text.match(/^Original-Rcpt-To:\s*(.+)$/im)?.[1]),
        userAgent: text.match(/^User-Agent:\s*(.+)$/im)?.[1]?.trim() ?? null,
      }
    }
  }
  // Microsoft JMRP and similar: not ARF, but an abuse report with the original attached
  const subject = (parsed.subject ?? '').toLowerCase()
  const contentType = String(parsed.headers.get('content-type') ?? '').toLowerCase()
  if (/report-type="?feedback-report/.test(contentType) || /complaint|abuse report|junk mail report|spam report/.test(subject)) {
    const hasOriginal = (parsed.attachments ?? []).some(a => (a.contentType || '').toLowerCase() === 'message/rfc822')
    if (hasOriginal) return { feedbackType: 'abuse', originalRecipient: null, userAgent: null }
  }
  return null
}

// ── DMARC aggregate reports ────────────────────────────────────────────────

/** Minimal unzip: returns the first file of a ZIP archive (DMARC zips hold one XML). */
export function unzipFirst(buf: Buffer): Buffer | null {
  // End of central directory record
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) return null
  const method = buf.readUInt16LE(cdOffset + 10)
  const compSize = buf.readUInt32LE(cdOffset + 20)
  const localOffset = buf.readUInt32LE(cdOffset + 42)
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null
  const nameLen = buf.readUInt16LE(localOffset + 26)
  const extraLen = buf.readUInt16LE(localOffset + 28)
  const start = localOffset + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + compSize)
  if (method === 0) return Buffer.from(data)
  if (method === 8) return inflateRawSync(data)
  return null
}

export function dmarcXmlFromAttachment(a: Attachment): string | null {
  const name = (a.filename || '').toLowerCase()
  const type = (a.contentType || '').toLowerCase()
  const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content ?? ''))
  try {
    if (name.endsWith('.zip') || (type.includes('zip') && !type.includes('gzip'))) {
      const x = unzipFirst(buf)
      return x ? x.toString('utf-8') : null
    }
    if (name.endsWith('.gz') || type.includes('gzip')) return gunzipSync(buf).toString('utf-8')
    if (name.endsWith('.xml') || type.includes('xml')) return buf.toString('utf-8')
  } catch {
    return null
  }
  return null
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].trim() : null
}

export interface DmarcReport {
  orgName: string | null
  reportId: string | null
  domain: string | null
  policy: string | null
  dateBegin: number | null
  dateEnd: number | null
  total: number
  dmarcPass: number
  spfAligned: number
  dkimAligned: number
  sources: { ip: string; count: number; disposition: string; dkim: string; spf: string }[]
}

export function parseDmarcXml(xml: string): DmarcReport | null {
  if (!/<feedback[\s>]/i.test(xml)) return null
  const meta = tag(xml, 'report_metadata') ?? ''
  const policy = tag(xml, 'policy_published') ?? ''
  const range = tag(meta, 'date_range') ?? ''
  const records = xml.match(/<record>[\s\S]*?<\/record>/gi) ?? []
  const report: DmarcReport = {
    orgName: tag(meta, 'org_name'),
    reportId: tag(meta, 'report_id'),
    domain: tag(policy, 'domain'),
    policy: tag(policy, 'p'),
    dateBegin: Number(tag(range, 'begin')) || null,
    dateEnd: Number(tag(range, 'end')) || null,
    total: 0, dmarcPass: 0, spfAligned: 0, dkimAligned: 0,
    sources: [],
  }
  for (const r of records) {
    const row = tag(r, 'row') ?? ''
    const evalPol = tag(row, 'policy_evaluated') ?? ''
    const count = Number(tag(row, 'count')) || 0
    const dkim = (tag(evalPol, 'dkim') ?? 'fail').toLowerCase()
    const spf = (tag(evalPol, 'spf') ?? 'fail').toLowerCase()
    report.total += count
    if (dkim === 'pass') report.dkimAligned += count
    if (spf === 'pass') report.spfAligned += count
    if (dkim === 'pass' || spf === 'pass') report.dmarcPass += count
    report.sources.push({
      ip: tag(row, 'source_ip') ?? '?',
      count,
      disposition: (tag(evalPol, 'disposition') ?? 'none').toLowerCase(),
      dkim,
      spf,
    })
  }
  return report
}
