import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, toWebHandler } from 'h3'

const smtp = await vi.hoisted(async () => {
  const { defineEventHandler, readBody } = await import('h3')
  const config = {
    smtpHost: 'smtp.example.test', smtpPort: 587, smtpSecure: false,
    smtpUser: 'primary@example.test', smtpPass: 'secret',
    smtpFromName: 'Principal', smtpFromEmail: 'primary@example.test',
    smtpProfiles: [{
      id: 'alternative', name: 'Alternativo', host: 'alternative.example.test', port: 465, secure: true,
      user: 'login@example.test', pass: 'other-secret', fromName: 'Otra marca', fromEmail: 'brand@example.test',
      replyTo: 'replies@example.test', dkimDomain: 'example.test', dkimSelector: 'mail', dkimPrivateKey: 'key\\nvalue',
    }],
  }
  vi.stubGlobal('defineEventHandler', defineEventHandler)
  vi.stubGlobal('readBody', readBody)
  vi.stubGlobal('useServerConfig', () => config)
  return { createTransport: vi.fn(), verify: vi.fn(), sendMail: vi.fn(), close: vi.fn() }
})

vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }))

const endpoint = (await import('~/server/api/settings/test-smtp.post')).default
const handle = toWebHandler(createApp().use('/api/settings/test-smtp', endpoint))

async function request(body: Record<string, unknown>) {
  return handle(new Request('http://localhost/api/settings/test-smtp', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  vi.resetAllMocks()
  smtp.verify.mockResolvedValue(true)
  smtp.sendMail.mockResolvedValue({ accepted: ['recipient@example.test'] })
  smtp.createTransport.mockReturnValue({ verify: smtp.verify, sendMail: smtp.sendMail, close: smtp.close })
})

afterAll(() => vi.unstubAllGlobals())

describe('settings SMTP checks', () => {
  it('checks the connection without sending when no recipient is supplied', async () => {
    const response = await request({ id: 'default' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, connectMs: expect.any(Number) })
    expect(smtp.verify).toHaveBeenCalledOnce()
    expect(smtp.sendMail).not.toHaveBeenCalled()
    expect(smtp.close).toHaveBeenCalledOnce()
  })

  it('sends one test to the trimmed recipient using the selected profile and identity', async () => {
    const response = await request({ id: 'alternative', to: '  recipient@example.test  ' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(smtp.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'alternative.example.test', port: 465, secure: true,
      auth: { user: 'login@example.test', pass: 'other-secret' },
      dkim: { domainName: 'example.test', keySelector: 'mail', privateKey: 'key\nvalue' },
    }))
    expect(smtp.sendMail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      to: 'recipient@example.test', from: '"Otra marca" <brand@example.test>', replyTo: 'replies@example.test',
      subject: 'TurboMailer — prueba SMTP (Alternativo)', messageId: expect.stringMatching(/@example\.test>$/),
    }))
    expect(smtp.close).toHaveBeenCalledOnce()
  })

  it.each(['', '   ', 'invalid', 'one@example.test,two@example.test', null, 123, ['recipient@example.test']])(
    'rejects invalid recipients before making any SMTP connection: %j', async to => {
      const response = await request({ id: 'default', to })
      expect(response.status).toBe(400)
      expect(smtp.createTransport).not.toHaveBeenCalled()
      expect(smtp.verify).not.toHaveBeenCalled()
      expect(smtp.sendMail).not.toHaveBeenCalled()
    },
  )

  it('reports an unknown profile without contacting SMTP', async () => {
    const response = await request({ id: 'missing', to: 'recipient@example.test' })
    expect(response.status).toBe(404)
    expect(smtp.createTransport).not.toHaveBeenCalled()
  })

  it('reports connection failures and closes the transport without sending', async () => {
    smtp.verify.mockRejectedValue({ code: 'EAUTH', message: 'Authentication failed' })
    const response = await request({ id: 'default', to: 'recipient@example.test' })
    expect(await response.json()).toMatchObject({ ok: false, stage: 'connect', error: expect.stringContaining('Credenciales SMTP rechazadas') })
    expect(smtp.sendMail).not.toHaveBeenCalled()
    expect(smtp.close).toHaveBeenCalledOnce()
  })

  it('distinguishes delivery failures and closes the transport', async () => {
    smtp.sendMail.mockRejectedValue({ responseCode: 550, response: '550 5.1.1 User unknown' })
    const response = await request({ id: 'default', to: 'recipient@example.test' })
    expect(await response.json()).toMatchObject({ ok: false, stage: 'send', connectMs: expect.any(Number), error: expect.stringContaining('Dirección inexistente') })
    expect(smtp.close).toHaveBeenCalledOnce()
  })
})
