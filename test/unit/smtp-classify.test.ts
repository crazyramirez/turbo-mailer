import { describe, it, expect } from 'vitest'
import { classifySmtpError } from '~/server/utils/smtp-classify'

const err = (responseCode: number | undefined, response: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(response), { responseCode, response, command: 'RCPT TO', ...extra })

describe('classifySmtpError — who is at fault', () => {
  it.each([
    ['550 5.1.1 <a@b.com>: Recipient address rejected: User unknown in virtual mailbox table', 'hard'],
    ['550-5.1.1 The email account that you tried to reach does not exist.', 'hard'],
    ['550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup', 'hard'],
    ['550 5.4.1 Recipient address rejected: Access denied. AS(201806281)', 'hard'],
    ['550 5.2.1 The email account that you tried to reach is disabled.', 'hard'],
    ['552 5.2.2 The email account that you tried to reach is over quota.', 'soft'],
    ['550-5.7.26 This mail is unauthenticated, which poses a security risk', 'block'],
    ['550 5.7.1 Service unavailable, Client host [1.2.3.4] blocked using Spamhaus', 'block'],
    ['554 5.7.1 Message rejected as spam by Content Filtering', 'block'],
    ['550 5.7.1 Recipient address rejected: Access denied by policy', 'block'],
    ['553 5.1.8 <sender@x.com>: Sender address rejected: Domain not found', 'block'],
    ['550 Requested action not taken: mailbox unavailable', 'hard'],
    ['554 Transaction failed', 'block'],
    ['451 4.7.1 Greylisted, please try again later', 'soft'],
    ['450 4.2.1 The user you are trying to contact is receiving mail too quickly', 'rate_limit'],
    ['421-4.7.28 Our system has detected an unusual rate of unsolicited mail', 'rate_limit'],
    ['452 4.2.2 Mailbox full', 'soft'],
  ])('%s → %s', (msg, kind) => {
    const code = Number(msg.slice(0, 3))
    expect(classifySmtpError(err(code, msg)).kind).toBe(kind)
  })

  it('connection problems never blame the recipient', () => {
    expect(classifySmtpError(Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:465'), { code: 'ECONNECTION' })).kind).toBe('connection')
    expect(classifySmtpError(Object.assign(new Error('Greeting never received'), { code: 'ETIMEDOUT' })).kind).toBe('connection')
    expect(classifySmtpError(new Error('something odd')).kind).toBe('connection')
  })

  it('credentials', () => {
    expect(classifySmtpError(Object.assign(new Error('Invalid login: 535 5.7.8 Username and Password not accepted'), { code: 'EAUTH', responseCode: 535 })).kind).toBe('auth')
  })

  it('MAIL FROM rejection is about the sender', () => {
    expect(classifySmtpError(err(550, '550 5.1.0 Sender rejected', { command: 'MAIL FROM' })).kind).toBe('block')
  })
})
