import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { finalizeEmailHtml, matchingDivEnd } from '~/server/utils/email-compile'
import { lintEmailHtml } from '~/server/utils/email-lint'
import { DomUtils, parseDocument } from 'htmlparser2'

const demoDir = path.resolve(__dirname, '../../data/demo')
const demos = fs.readdirSync(demoDir).filter(f => f.endsWith('.html')).map(f => [f, fs.readFileSync(path.join(demoDir, f), 'utf-8')] as const)
const elements = (html: string, name: string) => DomUtils.findAll(element => element.name === name, parseDocument(html).children)

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
    expect(out).toMatch(/<a href="https:\/\/x\.com"\s*style="font-family: 'Outfit', Arial;color: rgb\(255, 255, 255\);display:inline-block;mso-line-height-rule:exactly" class="email-button">Comprar<\/a>/)
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

  it.each(['max-width:100%;', 'max-width:100%;width:auto;', 'min-width:100%;max-width:100%;'])('does not turn %s into an explicit full-width CTA', width => {
    const out = finalizeEmailHtml(`<div data-type="Acción"><a href="https://marca.es" data-toggle="button" style="display:inline-block;background:#6366f1;padding:14px 24px;${width}">Ver colección</a></div>`)
    const button = elements(out, 'table').find(table => table.attribs['data-tm-btn'])!
    expect(button.attribs.width).toBeUndefined()
    expect(button.attribs.align).toBe('center')
    expect(button.attribs.style).not.toMatch(/(?:^|;)width:100%/)
    expect(finalizeEmailHtml(out)).toBe(out)
  })

  it('retains an intentional full-width CTA including a width marked important', () => {
    const out = finalizeEmailHtml('<a href="https://marca.es" style="display:block;background:#6366f1;padding:14px 24px;width: 100% !important;">Ver colección</a>')
    expect(elements(out, 'table').find(table => table.attribs['data-tm-btn'])?.attribs.width).toBe('100%')
  })

  it('preserves responsive styling hooks when stripping native editor metadata', () => {
    const out = finalizeEmailHtml(`<div class="main-card"><section class="hero-block editable-block" data-type="Portada" data-note="A &gt; B">
      <h1 data-toggle="title">Una gran idea</h1><p data-toggle="subtitle">Un mensaje claro.</p>
      <a href="https://marca.es" data-toggle="button" style="display:inline-block;background:#6366f1;padding:14px 24px;">Descubrir</a>
      <span data-toggle="code">CLIENTES</span></section></div>`)
    expect(elements(out, 'section')[0].attribs).toMatchObject({ class: 'hero-block editable-block email-block', 'data-note': 'A > B' })
    for (const [tag, field] of [['h1', 'title'], ['p', 'subtitle'], ['a', 'button'], ['span', 'code']]) {
      expect(elements(out, tag)[0].attribs.class).toContain(`email-${field}`)
    }
    expect(out).not.toMatch(/\sdata-(?:type|toggle)=/)
    expect(out).toContain('data-tm="responsive"')
    expect(out).toContain('.main-card .hero-block .email-title')
    expect(finalizeEmailHtml(out)).toBe(out)
  })

  it('keeps Quad in pairs and uses the shared small-screen rule rather than generic full-width stacking', () => {
    const out = finalizeEmailHtml(`<div class="main-card"><div class="grid-block editable-block" data-type="Grid"><table><tr>${Array.from({ length: 4 }, (_, i) => `<td class="grid-quad-td" width="25%" valign="top">Pieza ${i + 1}</td>`).join('')}</tr></table></div></div>`)
    const grid = elements(out, 'table')[0]
    expect(grid.attribs.class).toContain('email-grid-table')
    expect(grid.attribs.class).toContain('email-stack-table')
    expect(grid.attribs.class).not.toMatch(/\btm-stack\b/)
    expect(out).toContain('.grid-quad-td, .main-card .ai-layout-half { display: inline-block !important; width: 50% !important;')
    expect(out).toContain('@media only screen and (max-width: 360px)')
    expect(finalizeEmailHtml(out)).toBe(out)
  })

  it('annotates layout tables without treating nested bulletproof buttons as responsive columns', () => {
    const out = finalizeEmailHtml(`<div class="main-card"><div class="pricing-block editable-block" data-type="Precios"><table><tr><td width="100%" valign="top">
      <a href="https://marca.es" data-toggle="button" style="display:inline-block;background:#6366f1;padding:14px 24px;max-width:100%;">Elegir plan</a>
      </td></tr></table></div></div>`)
    const tables = elements(out, 'table')
    expect(tables[0].attribs.class).toContain('email-pricing-table')
    expect(tables[0].attribs.class).toContain('email-stack-table')
    expect(tables[1].attribs['data-tm-btn']).toBe('1')
    expect(tables[1].attribs.class).toBeUndefined()
    expect(finalizeEmailHtml(out)).toBe(out)
    expect(elements(finalizeEmailHtml(out), 'table')[1].attribs.class).toBeUndefined()
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
