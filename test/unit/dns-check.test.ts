import { describe, it, expect, vi, beforeEach } from 'vitest'

const resolveTxt = vi.fn()
vi.mock('node:dns', () => ({ promises: { resolveTxt: (...args: any[]) => resolveTxt(...args) } }))

import { checkDnsAuth, senderDomainFromEmail } from '~/server/utils/dns-check'

describe('senderDomainFromEmail', () => {
  it('extracts the domain from an email address', () => {
    expect(senderDomainFromEmail('info@example.com')).toBe('example.com')
    expect(senderDomainFromEmail('a@sub.example.co.uk')).toBe('sub.example.co.uk')
  })

  it('lowercases the domain', () => {
    expect(senderDomainFromEmail('info@EXAMPLE.COM')).toBe('example.com')
  })

  it('returns null for invalid input', () => {
    expect(senderDomainFromEmail('not-an-email')).toBe(null)
    expect(senderDomainFromEmail('')).toBe(null)
    expect(senderDomainFromEmail(undefined)).toBe(null)
  })
})

describe('checkDnsAuth', () => {
  beforeEach(() => {
    resolveTxt.mockReset()
  })

  it('detects SPF and DMARC records, joining chunked TXT answers', async () => {
    resolveTxt.mockImplementation(async (name: string) => {
      if (name === 'spfok.test') return [['v=spf1 include:_spf.google.com', ' ~all']]
      if (name === '_dmarc.spfok.test') return [['v=DMARC1; p=quarantine; rua=mailto:x@spfok.test']]
      return []
    })

    const res = await checkDnsAuth('spfok.test')
    expect(res.spf.found).toBe(true)
    expect(res.spf.record).toContain('~all')
    expect(res.dmarc.found).toBe(true)
    expect(res.dmarc.policy).toBe('quarantine')
    expect(res.dkim).toBeUndefined()
  })

  it('reports missing records on authoritative negative answers', async () => {
    resolveTxt.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))

    const res = await checkDnsAuth('missing.test')
    expect(res.spf.found).toBe(false)
    expect(res.dmarc.found).toBe(false)
  })

  it('falls back to DNS-over-HTTPS when the system resolver is unreachable', async () => {
    resolveTxt.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    const fetchMock = vi.fn(async (url: any) => ({
      ok: true,
      json: async () => (String(url).includes('_dmarc')
        ? { Answer: [] }
        : { Answer: [{ type: 16, data: '"v=spf1 include:_spf.google.com" " ~all"' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await checkDnsAuth('doh-fallback.test')
    expect(res.spf.found).toBe(true)
    expect(res.spf.record).toContain('~all')
    expect(fetchMock).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('throws (unknown) instead of reporting false negatives when DNS is fully unavailable', async () => {
    resolveTxt.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    await expect(checkDnsAuth('offline.test')).rejects.toThrow('DNS unavailable')
    vi.unstubAllGlobals()
  })

  it('checks the DKIM selector record when a selector is given', async () => {
    resolveTxt.mockImplementation(async (name: string) => {
      if (name === 'sel1._domainkey.dkim.test') return [['v=DKIM1; k=rsa; p=MIGfMA0GCSq']]
      return []
    })

    const res = await checkDnsAuth('dkim.test', 'sel1')
    expect(res.dkim?.found).toBe(true)
    expect(res.dkim?.selector).toBe('sel1')
  })

  it('ignores TXT records that only mention spf mid-string', async () => {
    resolveTxt.mockImplementation(async (name: string) => {
      if (name === 'fake.test') return [['verification=v=spf1-lookalike']]
      return []
    })

    const res = await checkDnsAuth('fake.test')
    expect(res.spf.found).toBe(false)
  })

  it('caches results per domain+selector', async () => {
    resolveTxt.mockResolvedValue([['v=spf1 -all']])
    await checkDnsAuth('cached.test')
    const callsAfterFirst = resolveTxt.mock.calls.length
    await checkDnsAuth('cached.test')
    expect(resolveTxt.mock.calls.length).toBe(callsAfterFirst)
  })
})
