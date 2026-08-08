// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { sanitizePastedHtml, plainTextToHtml } from '~/utils/editorPaste'

const clean = (html: string) => sanitizePastedHtml(html, document)

describe('sanitizePastedHtml', () => {
  it('strips script tags and their content', () => {
    const out = clean('<p>hola<script>alert(1)</script></p>')
    expect(out).not.toMatch(/script|alert/i)
    expect(out).toContain('hola')
  })

  it('strips Word style blocks and mso attributes', () => {
    const word = `<style>p.MsoNormal{mso-style-parent:""}</style>` +
      `<p class="MsoNormal" style="mso-line-height-alt:12pt;color:#ff0000">Texto</p>`
    const out = clean(word)
    expect(out).not.toMatch(/mso-|MsoNormal|<style/i)
    expect(out).toContain('Texto')
  })

  it('drops colors and fonts so pasted text adopts the template theme', () => {
    const out = clean('<p style="color:#ff0000;font-family:Comic Sans;font-size:42px">X</p>')
    expect(out).not.toMatch(/color|font-family|font-size/i)
  })

  it('keeps basic emphasis markup', () => {
    const out = clean('<p><b>bold</b> and <i>italic</i> and <u>under</u></p>')
    expect(out).toMatch(/<b>bold<\/b>/)
    expect(out).toMatch(/<i>italic<\/i>/)
    expect(out).toMatch(/<u>under<\/u>/)
  })

  it('keeps text-align and font-weight styles', () => {
    const out = clean('<p style="text-align:center;font-weight:700">X</p>')
    expect(out).toContain('text-align:center')
    expect(out).toContain('font-weight:700')
  })

  it('unwraps unsupported tags but keeps their text', () => {
    const out = clean('<table><tr><td>celda</td></tr></table>')
    expect(out).not.toMatch(/<table|<td/i)
    expect(out).toContain('celda')
  })

  it('keeps safe links and forces a new tab', () => {
    const out = clean('<a href="https://example.com">link</a>')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
  })

  it('removes javascript: links but keeps the anchor text', () => {
    const out = clean('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toMatch(/javascript:/i)
    expect(out).toContain('click')
  })

  it('strips inline event handlers', () => {
    const out = clean('<p onclick="alert(1)" onmouseover="x()">hola</p>')
    expect(out).not.toMatch(/onclick|onmouseover|alert/i)
    expect(out).toContain('hola')
  })

  it('removes iframes entirely', () => {
    const out = clean('<p>a</p><iframe src="https://evil.tld"></iframe>')
    expect(out).not.toMatch(/<iframe|evil\.tld/i)
  })

  it('handles empty input', () => {
    expect(clean('')).toBe('')
  })
})

describe('plainTextToHtml', () => {
  it('converts newlines to <br>', () => {
    expect(plainTextToHtml('a\nb')).toBe('a<br>b')
    expect(plainTextToHtml('a\r\nb')).toBe('a<br>b')
  })

  it('escapes html so plain text is never parsed as markup', () => {
    const out = plainTextToHtml('<script>alert(1)</script>')
    expect(out).not.toMatch(/<script/)
    expect(out).toContain('&lt;script&gt;')
  })

  it('handles empty input', () => {
    expect(plainTextToHtml('')).toBe('')
  })
})
