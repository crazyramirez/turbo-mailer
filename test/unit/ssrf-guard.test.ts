import { describe, it, expect } from 'vitest'
import { assertPublicHttpUrl } from '~/server/utils/ssrf-guard'

describe('assertPublicHttpUrl', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow()
    await expect(assertPublicHttpUrl('ftp://x.com/a')).rejects.toThrow()
    await expect(assertPublicHttpUrl('gopher://x')).rejects.toThrow()
  })

  it('rejects invalid URLs', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow()
    await expect(assertPublicHttpUrl('')).rejects.toThrow()
  })

  it('rejects loopback and private IPv4 literals', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.1.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1']) {
      await expect(assertPublicHttpUrl(`http://${ip}/x`)).rejects.toThrow()
    }
  })

  it('rejects IPv6 loopback and private literals', async () => {
    await expect(assertPublicHttpUrl('http://[::1]/x')).rejects.toThrow()
    await expect(assertPublicHttpUrl('http://[fd00::1]/x')).rejects.toThrow()
    await expect(assertPublicHttpUrl('http://[fe80::1]/x')).rejects.toThrow()
  })

  it('rejects IPv4-mapped IPv6 private addresses', async () => {
    await expect(assertPublicHttpUrl('http://[::ffff:10.0.0.1]/x')).rejects.toThrow()
  })

  it('accepts public IP literals', async () => {
    const url = await assertPublicHttpUrl('https://93.184.216.34/img.png')
    expect(url.hostname).toBe('93.184.216.34')
  })

  it('rejects hostnames resolving to loopback', async () => {
    // "localhost" resolves to 127.0.0.1/::1 on every platform
    await expect(assertPublicHttpUrl('http://localhost/x')).rejects.toThrow()
  })
})
