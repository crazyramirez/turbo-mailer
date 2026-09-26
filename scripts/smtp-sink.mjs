#!/usr/bin/env node
// Minimal SMTP sink for local end-to-end and load testing — never use it as a
// real mail server. Accepts every message (plain SMTP, AUTH accepted blindly),
// stores one JSON line per message and can simulate failures:
//
//   node scripts/smtp-sink.mjs [--port 2525] [--out sink.jsonl]
//     --reject-rcpt "regex"   → 550 5.1.1 for matching recipients (hard bounce)
//     --block-rcpt "regex"    → 550 5.7.1 policy rejection
//     --defer-rcpt "regex"    → 451 4.7.1 greylisting
//     --quiet                 → no per-message log line
//
// Stats are printed every 5s when messages arrive.

import net from 'node:net'
import { appendFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const port = Number(arg('port', 2525))
const out = arg('out', 'smtp-sink.jsonl')
const reject = arg('reject-rcpt') ? new RegExp(arg('reject-rcpt'), 'i') : null
const block = arg('block-rcpt') ? new RegExp(arg('block-rcpt'), 'i') : null
const defer = arg('defer-rcpt') ? new RegExp(arg('defer-rcpt'), 'i') : null
const quiet = args.includes('--quiet')

writeFileSync(out, '')
let total = 0
let lastReport = 0

const server = net.createServer((socket) => {
  socket.setEncoding('utf8')
  let buffer = ''
  let inData = false
  let data = []
  let mailFrom = ''
  let rcpts = []
  let authStep = 0
  const send = (line) => socket.write(line + '\r\n')
  send('220 sink.local ESMTP TurboMailer test sink')

  socket.on('data', (chunk) => {
    buffer += chunk
    let idx
    while ((idx = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (inData) {
        if (line === '.') {
          inData = false
          const raw = data.join('\r\n')
          // Unfold continuation lines of long headers (RFC 5322 folding)
          const header = raw.split('\r\n\r\n')[0].replace(/\r\n[ \t]+/g, ' ')
          const subject = (header.match(/^Subject: (.*)$/mi) || [])[1] || ''
          const messageId = (header.match(/^Message-ID: (.*)$/mi) || [])[1] || ''
          const tmId = (header.match(/^X-TM-ID: (.*)$/mi) || [])[1] || ''
          const listUnsub = (header.match(/^List-Unsubscribe: (.*)$/mi) || [])[1] || ''
          const dkim = /^DKIM-Signature:/mi.test(header)
          appendFileSync(out, JSON.stringify({ at: Date.now(), from: mailFrom, to: rcpts, subject, messageId, tmId, listUnsub, dkim, size: raw.length }) + '\n')
          total++
          if (!quiet) console.log(`[sink] #${total} ${rcpts.join(',')} "${subject.slice(0, 60)}"`)
          send('250 2.0.0 OK queued')
          data = []
          rcpts = []
        } else {
          data.push(line.startsWith('..') ? line.slice(1) : line)
        }
        continue
      }
      if (authStep) {
        // AUTH continuation lines (credentials accepted blindly)
        if (authStep === 1) { authStep = 2; send('334 UGFzc3dvcmQ6') }
        else { authStep = 0; send('235 2.7.0 Authentication successful') }
        continue
      }
      const cmd = line.slice(0, 4).toUpperCase()
      if (cmd === 'EHLO' || cmd === 'HELO') {
        socket.write('250-sink.local\r\n250-AUTH PLAIN LOGIN\r\n250-8BITMIME\r\n250 SIZE 52428800\r\n')
      } else if (cmd === 'AUTH') {
        const parts = line.trim().split(/\s+/)
        if (/^LOGIN$/i.test(parts[1] || '')) {
          if (parts[2]) { authStep = 2; send('334 UGFzc3dvcmQ6') } else { authStep = 1; send('334 VXNlcm5hbWU6') }
        } else if (/^PLAIN$/i.test(parts[1] || '') && !parts[2]) {
          authStep = 2; send('334 ')
        } else {
          send('235 2.7.0 Authentication successful')
        }
      } else if (cmd === 'MAIL') {
        mailFrom = (line.match(/<([^>]*)>/) || [])[1] || ''
        send('250 2.1.0 OK')
      } else if (cmd === 'RCPT') {
        const rcpt = (line.match(/<([^>]*)>/) || [])[1] || ''
        if (reject && reject.test(rcpt)) send(`550 5.1.1 <${rcpt}>: Recipient address rejected: User unknown`)
        else if (block && block.test(rcpt)) send('550 5.7.1 Message rejected due to sender reputation (test block)')
        else if (defer && defer.test(rcpt)) send('451 4.7.1 Greylisted, please come back later')
        else { rcpts.push(rcpt); send('250 2.1.5 OK') }
      } else if (cmd === 'DATA') {
        if (!rcpts.length) { send('554 5.5.1 No valid recipients'); continue }
        inData = true
        send('354 End data with <CR><LF>.<CR><LF>')
      } else if (cmd === 'RSET') {
        mailFrom = ''; rcpts = []; data = []
        send('250 2.0.0 OK')
      } else if (cmd === 'NOOP') {
        send('250 2.0.0 OK')
      } else if (cmd === 'QUIT') {
        send('221 2.0.0 Bye')
        socket.end()
      } else {
        send('250 OK')
      }
    }
  })
  socket.on('error', () => {})
})

server.listen(port, '127.0.0.1', () => console.log(`[sink] listening on 127.0.0.1:${port}, writing ${out}`))
setInterval(() => {
  if (total !== lastReport) {
    console.log(`[sink] total=${total}`)
    lastReport = total
  }
}, 5000).unref()
