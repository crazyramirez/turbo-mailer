import net from 'node:net'
import MailComposer from 'nodemailer/lib/mail-composer'

// Real spam scoring of the exact message, when a filter is available:
//
//   spamCheckUrl = http://host:11333       rspamd (POST /checkv2)
//   spamCheckUrl = spamd://host:783         SpamAssassin spamd
//
// Both run fine in a sidecar container (see docker-compose.yml). Without one,
// the precheck relies on the built-in weighted analysis (content-score.ts).

export interface SpamCheckResult {
  engine: 'rspamd' | 'spamassassin'
  score: number
  threshold: number
  isSpam: boolean
  symbols: { name: string; score: number; description?: string }[]
}

export async function buildRawMessage(mail: { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string>; messageId?: string }): Promise<Buffer> {
  const composer = new MailComposer({
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: mail.headers,
    messageId: mail.messageId,
  })
  return composer.compile().build()
}

async function checkRspamd(baseUrl: string, raw: Buffer, meta: { from: string; rcpt: string }): Promise<SpamCheckResult> {
  const url = baseUrl.replace(/\/$/, '') + '/checkv2'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      From: meta.from,
      Rcpt: meta.rcpt,
      // No IP header: SPF can't be judged from here and would add noise
      Pass: 'all',
    },
    body: raw,
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`rspamd ${res.status}`)
  const json = await res.json() as { score: number; required_score: number; action: string; symbols?: Record<string, { name: string; score: number; description?: string }> }
  const symbols = Object.values(json.symbols ?? {})
    .filter(s => s.score !== 0)
    // SPF/DMARC can't be evaluated from a local submission — drop to avoid false alarms
    .filter(s => !/^(R_SPF_|SPF_|DMARC_|R_DKIM_NA|ARC_NA|R_DKIM_ALLOW|FORGED_SENDER)/.test(s.name))
    .sort((a, b) => b.score - a.score)
  const score = Math.round(symbols.reduce((sum, s) => sum + s.score, 0) * 100) / 100
  return { engine: 'rspamd', score, threshold: json.required_score ?? 15, isSpam: score >= (json.required_score ?? 15), symbols }
}

function checkSpamd(host: string, port: number, raw: Buffer): Promise<SpamCheckResult> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    let data = ''
    socket.setTimeout(15_000, () => { socket.destroy(); reject(new Error('spamd timeout')) })
    socket.on('error', reject)
    socket.on('data', c => { data += c.toString('utf-8') })
    socket.on('end', () => {
      const m = data.match(/Spam:\s*(True|False)\s*;\s*(-?[\d.]+)\s*\/\s*(-?[\d.]+)/i)
      if (!m) return reject(new Error('spamd: unexpected answer'))
      const body = data.split(/\r?\n\r?\n/).slice(1).join('\n')
      const symbols = body.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name, score: 0 }))
      resolve({ engine: 'spamassassin', score: Number(m[2]), threshold: Number(m[3]), isSpam: m[1].toLowerCase() === 'true', symbols })
    })
    socket.on('connect', () => {
      socket.write(`SYMBOLS SPAMC/1.5\r\nContent-length: ${raw.length}\r\n\r\n`)
      socket.write(raw)
      socket.end()
    })
  })
}

export async function runSpamCheck(spamCheckUrl: string, raw: Buffer, meta: { from: string; rcpt: string }): Promise<SpamCheckResult> {
  const url = String(spamCheckUrl).trim()
  if (/^spamd:\/\//i.test(url)) {
    const u = new URL(url.replace(/^spamd:/i, 'http:'))
    return checkSpamd(u.hostname, Number(u.port || 783), raw)
  }
  return checkRspamd(url.replace(/^rspamd:/i, 'http:'), raw, meta)
}
