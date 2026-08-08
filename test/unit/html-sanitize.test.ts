import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'

describe('sanitizeEmailHtml', () => {
  it('removes script blocks', () => {
    expect(sanitizeEmailHtml('a<script>alert(1)</script>b')).toBe('ab')
  })

  it('removes inline event handlers', () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)">')
    expect(out).not.toMatch(/onerror/i)
  })

  it('neutralizes javascript: hrefs', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
  })

  it('neutralizes data:text/html URIs', () => {
    const out = sanitizeEmailHtml('<a href="data:text/html,<script>x</script>">x</a>')
    expect(out).not.toContain('data:text/html')
  })

  it('preserves normal email markup', () => {
    const html = '<table><tr><td style="color:red">Hola</td></tr></table><a href="https://x.com">link</a>'
    expect(sanitizeEmailHtml(html)).toBe(html)
  })

  it('handles empty input', () => {
    expect(sanitizeEmailHtml('')).toBe('')
  })
})

const TAB = String.fromCharCode(9)
const NUL = String.fromCharCode(0)

describe('sanitizeEmailHtml bypass probes', () => {
  const bad = /<script|onerror|onload|<iframe|javascript:/i

  it('strips unclosed script', () => {
    expect(sanitizeEmailHtml('<script>alert(1)')).not.toMatch(bad)
  })
  it('neutralizes unquoted javascript href', () => {
    expect(sanitizeEmailHtml('<a href=javascript:alert(1)>x</a>')).not.toMatch(bad)
  })
  it('neutralizes entity-obfuscated scheme', () => {
    expect(sanitizeEmailHtml('<a href="java&#115;cript:alert(1)">x</a>')).not.toMatch(/alert/)
  })
  it('neutralizes tab-split scheme', () => {
    expect(sanitizeEmailHtml(`<a href="java${TAB}script:alert(1)">x</a>`)).not.toMatch(/alert/)
  })
  it('neutralizes NUL-split scheme', () => {
    expect(sanitizeEmailHtml(`<a href="java${NUL}script:alert(1)">x</a>`)).not.toMatch(/alert/)
  })
  it('strips svg/onload with slash separator', () => {
    expect(sanitizeEmailHtml('<svg/onload=alert(1)>')).not.toMatch(bad)
  })
  it('strips iframes', () => {
    expect(sanitizeEmailHtml('<iframe src="https://evil.tld"></iframe>')).not.toMatch(bad)
  })
  it('keeps legitimate email markup untouched', () => {
    const html = '<table><tr><td style="color:red">Hola</td></tr></table><a href="https://x.com">link</a>'
    expect(sanitizeEmailHtml(html)).toBe(html)
  })
  it('keeps mailto, tel, cid and template vars', () => {
    const html = '<a href="mailto:a@b.c">m</a><a href="tel:+34600">t</a><img src="cid:logo"><a href="{{UNSUBSCRIBE_URL}}">u</a>'
    expect(sanitizeEmailHtml(html)).toBe(html)
  })
})
