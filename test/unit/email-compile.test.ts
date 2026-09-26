import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { finalizeEmailHtml, matchingDivEnd } from '~/server/utils/email-compile'
import { lintEmailHtml } from '~/server/utils/email-lint'

const demoDir = path.resolve(__dirname, '../../data/demo')
const demos = fs.readdirSync(demoDir).filter(f => f.endsWith('.html')).map(f => [f, fs.readFileSync(path.join(demoDir, f), 'utf-8')] as const)

describe('email compile', () => {
  it.each(demos)('%s: idempotent, fast, Outlook-ready', (_name, html) => {
    const t0 = Date.now()
    const once = finalizeEmailHtml(html)
    expect(Date.now() - t0).toBeLessThan(500)
    expect(finalizeEmailHtml(once)).toBe(once)
    expect(once).toMatch(/^<!DOCTYPE html>/)
    expect(once).toContain('o:OfficeDocumentSettings')
    expect(once).not.toMatch(/\sdata-(id|toggle|type)=/)
    expect(once).not.toMatch(/\sspellcheck=/)
    // Every <div> still balanced after wrapping
    expect((once.match(/<div\b/gi) ?? []).length).toBe((once.match(/<\/div>/gi) ?? []).length)
  })

  it('wraps the max-width container in an MSO ghost table', () => {
    const out = finalizeEmailHtml('<html><head></head><body><div style="max-width:600px;margin:0 auto"><p>x</p><div>y</div></div><p>after</p></body></html>')
    expect(out).toMatch(/<!--\[if mso\]><table role="presentation" data-tm="ghost" align="center" width="600"[^>]*><tr><td><!\[endif\]--><div style="max-width:600px;margin:0 auto"><p>x<\/p><div>y<\/div><\/div><!--\[if mso\]><\/td><\/tr><\/table><!\[endif\]--><p>after<\/p>/)
  })

  it('turns styled link buttons into bulletproof table buttons', () => {
    const out = finalizeEmailHtml(`<body><a href="https://x.com" data-toggle="button" style="display: block; background: rgb(99, 102, 241); border-radius: 14px; padding: 18px 32px; font-family: 'Outfit', Arial; color: rgb(255, 255, 255); width: 100%;">Comprar</a></body>`)
    expect(out).toContain('bgcolor="#6366f1"')
    expect(out).toContain('padding:18px 32px')
    expect(out).toMatch(/<a href="https:\/\/x\.com"\s*style="font-family: 'Outfit', Arial;color: rgb\(255, 255, 255\);display:inline-block;mso-line-height-rule:exactly">Comprar<\/a>/)
    expect(out).toContain('width="100%"')
  })

  it('leaves plain text links alone', () => {
    const html = '<body><a href="https://x.com" style="color:#333;text-decoration:underline">leer</a></body>'
    expect(finalizeEmailHtml(html)).toContain('<a href="https://x.com" style="color:#333;text-decoration:underline">leer</a>')
  })

  it('marks 3+ column grids as stackable and adds the media query once', () => {
    const grid = '<table><tr><td width="33%">a</td><td width="33%">b</td><td width="33%">c</td></tr></table>'
    const out = finalizeEmailHtml(`<html><head></head><body>${grid}${grid}</body></html>`)
    expect(out.match(/class="tm-stack"/g)?.length).toBe(2)
    expect(out.match(/data-tm="stack"/g)?.length).toBe(1)
  })

  it('matchingDivEnd handles nesting', () => {
    const h = '<div a><div b></div><div c><div d></div></div></div><div e></div>'
    expect(h.slice(0, matchingDivEnd(h, 0))).toBe('<div a><div b></div><div c><div d></div></div></div>')
  })

  it('lint flags real client problems', () => {
    const issues = lintEmailHtml('<div style="display:grid"><img src="a.webp"><svg></svg></div>')
    expect(issues.map(i => i.id).sort()).toEqual(['css_grid', 'svg', 'webp'])
  })
})
