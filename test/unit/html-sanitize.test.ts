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
