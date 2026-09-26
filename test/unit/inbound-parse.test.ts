import { describe, it, expect } from 'vitest'
import { simpleParser } from 'mailparser'
import { deflateRawSync, gzipSync } from 'node:zlib'
import {
  extractDsn, extractOriginalRefs, extractFeedbackReport, looksLikeBounce,
  parseDmarcXml, unzipFirst, dmarcXmlFromAttachment,
} from '~/server/utils/inbound-parse'

const DSN = [
  'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
  'To: bounces+b42.0123456789@example.com',
  'Subject: Delivery Status Notification (Failure)',
  'MIME-Version: 1.0',
  'Content-Type: multipart/report; report-type=delivery-status; boundary="XX"',
  '',
  '--XX',
  'Content-Type: text/plain; charset=UTF-8',
  '',
  "Your message wasn't delivered to nobody@example.org because the address couldn't be found.",
  '',
  '--XX',
  'Content-Type: message/delivery-status',
  '',
  'Reporting-MTA: dns; googlemail.com',
  '',
  'Final-Recipient: rfc822; nobody@example.org',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does',
  ' not exist.',
  '',
  '--XX',
  'Content-Type: text/rfc822-headers',
  '',
  'From: Sender <sender@example.com>',
  'To: nobody@example.org',
  'Subject: Hola',
  'Message-ID: <abc-123@example.com>',
  'X-TM-ID: 42.0123456789',
  '',
  '--XX--',
  '',
].join('\r\n')

const ARF = [
  'From: staff@hotmail.com',
  'To: fbl@example.com',
  'Subject: complaint about message',
  'MIME-Version: 1.0',
  'Content-Type: multipart/report; report-type=feedback-report; boundary="YY"',
  '',
  '--YY',
  'Content-Type: text/plain',
  '',
  'This is an email abuse report.',
  '',
  '--YY',
  'Content-Type: message/feedback-report',
  '',
  'Feedback-Type: abuse',
  'User-Agent: SomeGenerator/1.0',
  'Version: 1',
  'Original-Rcpt-To: victim@example.org',
  '',
  '--YY',
  'Content-Type: message/rfc822',
  '',
  'From: Sender <sender@example.com>',
  'To: victim@example.org',
  'Message-ID: <xyz-9@example.com>',
  'X-TM-ID: 77.aaaaaaaaaa',
  'Subject: Oferta',
  '',
  'body',
  '',
  '--YY--',
  '',
].join('\r\n')

describe('inbound parsing', () => {
  it('parses a standard DSN with the quoted original headers', async () => {
    const parsed = await simpleParser(DSN)
    expect(looksLikeBounce(parsed)).toBe(true)
    const rec = extractDsn(parsed)
    expect(rec).toHaveLength(1)
    expect(rec[0]).toMatchObject({ recipient: 'nobody@example.org', action: 'failed', status: '5.1.1' })
    expect(rec[0].diagnostic).toMatch(/does not exist/)
    const refs = extractOriginalRefs(parsed)
    expect(refs.tmId).toBe('42.0123456789')
    expect(refs.messageId).toBe('<abc-123@example.com>')
  })

  it('parses an ARF complaint', async () => {
    const parsed = await simpleParser(ARF)
    const fb = extractFeedbackReport(parsed)
    expect(fb).toMatchObject({ feedbackType: 'abuse', originalRecipient: 'victim@example.org' })
    expect(extractOriginalRefs(parsed).tmId).toBe('77.aaaaaaaaaa')
  })

  const XML = `<?xml version="1.0"?><feedback><report_metadata><org_name>google.com</org_name><report_id>123</report_id>
    <date_range><begin>1700000000</begin><end>1700086400</end></date_range></report_metadata>
    <policy_published><domain>example.com</domain><p>quarantine</p></policy_published>
    <record><row><source_ip>1.2.3.4</source_ip><count>10</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated></row></record>
    <record><row><source_ip>5.6.7.8</source_ip><count>3</count><policy_evaluated><disposition>quarantine</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated></row></record>
    </feedback>`

  it('parses a DMARC aggregate report', () => {
    const r = parseDmarcXml(XML)!
    expect(r).toMatchObject({ orgName: 'google.com', domain: 'example.com', policy: 'quarantine', total: 13, dmarcPass: 10 })
    expect(r.sources).toHaveLength(2)
  })

  it('unzips a single-file zip (deflate) and gunzips .gz reports', () => {
    const data = Buffer.from(XML)
    const comp = deflateRawSync(data)
    const name = Buffer.from('report.xml')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8)
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const cdOffset = 30 + name.length + comp.length
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20)
    cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(46 + name.length, 12); eocd.writeUInt32LE(cdOffset, 16)
    const zip = Buffer.concat([local, name, comp, cd, name, eocd])
    expect(unzipFirst(zip)?.toString()).toBe(XML)
    const gz = gzipSync(data)
    expect(dmarcXmlFromAttachment({ filename: 'r.xml.gz', contentType: 'application/gzip', content: gz } as any)).toBe(XML)
  })
})
