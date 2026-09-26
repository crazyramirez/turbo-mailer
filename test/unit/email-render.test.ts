import { describe, it, expect } from 'vitest'
import { absolutizeUrls, applyUtm, injectPreheader, injectTracking, compileCampaign, renderEmail } from '~/server/utils/email-render'
import { finalizeEmailHtml } from '~/server/utils/email-compile'

const BASE = 'https://mail.example.com'

describe('email rendering', () => {
  it('absolutizes relative and localhost asset URLs', () => {
    const html = '<img src="/uploads/a.png"><img src="http://localhost:3000/uploads/b.png"><a href="//cdn.x.com/c">c</a>'
    const out = absolutizeUrls(html, BASE)
    expect(out).toContain('src="https://mail.example.com/uploads/a.png"')
    expect(out).toContain('src="https://mail.example.com/uploads/b.png"')
    expect(out).toContain('href="//cdn.x.com/c"')
  })

  it('adds UTM only to external links without UTM', () => {
    const html = '<a href="https://shop.com/p?id=1">a</a><a href="https://shop.com/?utm_source=x">b</a><a href="https://mail.example.com/unsubscribe">u</a>'
    const out = applyUtm(html, { source: 'newsletter', campaign: 'oct' }, BASE)
    expect(out).toContain('https://shop.com/p?id=1&amp;utm_source=newsletter&amp;utm_campaign=oct')
    expect(out).toContain('https://shop.com/?utm_source=x"')
    expect(out).toContain('https://mail.example.com/unsubscribe"')
  })

  it('preheader goes right after <body>', () => {
    const out = injectPreheader('<html><body class="x"><p>hi</p></body></html>', 'Oferta')
    expect(out).toMatch(/<body class="x"><div style="display:none[^"]*">Oferta/)
  })

  it('tracking wraps links but respects data-notrack', () => {
    const out = injectTracking('<body><a href="https://a.com">a</a><a data-notrack href="https://b.com">b</a></body>', 5, BASE, 'secret')
    expect(out).toContain('/api/track/click?s=5&amp;u=https%3A%2F%2Fa.com')
    expect(out).toContain('href="https://b.com"')
    expect(out).toContain('/api/track/open?s=5')
  })

  it('finalize adds the email-client head and is idempotent', () => {
    const once = finalizeEmailHtml('<div data-id="x" contenteditable="true"><table><tr><td>a</td></tr></table></div>')
    expect(once).toMatch(/^<!DOCTYPE html>/)
    expect(once).toContain('<meta charset="utf-8">')
    expect(once).toContain('x-apple-disable-message-reformatting')
    expect(once).toContain('role="presentation"')
    expect(once).not.toContain('data-id')
    expect(once).not.toContain('contenteditable')
    expect(finalizeEmailHtml(once)).toBe(once)
  })

  it('renders escaped variables into HTML and plain subject', () => {
    const compiled = compileCampaign({ templateHtml: '<p>{{name}}</p><a href="{{UNSUBSCRIBE_URL}}">baja</a>', subject: 'Hola {{name}}', preheader: 'Para {{name}} <3' })
    const r = renderEmail({ compiled, variant: null, vars: { name: '<b>Ana</b> & co' }, sendId: 9, baseUrl: BASE, secret: 's', track: true })
    expect(r.html).toContain('&lt;b&gt;Ana&lt;/b&gt; &amp; co')
    expect(r.subject).toBe('Hola <b>Ana</b> & co')
    expect(r.html).toContain('Para &lt;b&gt;Ana&lt;/b&gt; &amp; co &lt;3')
    expect(r.html).toContain(`${BASE}/unsubscribe?s=9&t=`)
    expect(r.text).toContain('Darse de baja')
  })
})
