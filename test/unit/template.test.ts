import { describe, it, expect } from 'vitest'
import { applyVars, compileTemplate } from '~/server/utils/template'

describe('applyVars', () => {
  it('substitutes known fields', () => {
    expect(applyVars('Hola {{name}}', { name: 'Ana' })).toBe('Hola Ana')
  })

  it('resolves Spanish aliases case-insensitively', () => {
    expect(applyVars('{{Empresa}}', { company: 'ACME' })).toBe('ACME')
    expect(applyVars('{{ nombre }}', { Nombre: 'Luis' })).toBe('Luis')
  })

  it('HTML-escapes contact values (XSS protection)', () => {
    const out = applyVars('Hola {{name}}', { name: '<script>alert(1)</script>' })
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('escapes quotes to prevent attribute breakout', () => {
    const out = applyVars('<a title="{{name}}">x</a>', { name: '" onmouseover="evil()' })
    expect(out).not.toContain('"" onmouseover')
    expect(out).toContain('&quot;')
  })

  it('replaces missing values with empty string', () => {
    expect(applyVars('Hola {{name}}!', {})).toBe('Hola!')
  })

  it('tidies the punctuation around an empty merge tag', () => {
    expect(applyVars('{{Empresa}}, ¿qué experiencia hará que tu evento se recuerde?', {}))
      .toBe('¿Qué experiencia hará que tu evento se recuerde?')
    expect(applyVars('{{Empresa}}, ¿qué experiencia?', { company: 'ACME' })).toBe('ACME, ¿qué experiencia?')
    expect(applyVars('Hola {{name}}, te escribo', {})).toBe('Hola, te escribo')
    expect(applyVars('<p>{{name}}: novedades</p>', {})).toBe('<p>Novedades</p>')
    expect(applyVars('Para {{name}} y su equipo', {})).toBe('Para y su equipo')
    expect(applyVars('<a href="https://x.com/?r={{name}}&y=1">x</a>', {})).toBe('<a href="https://x.com/?r=&y=1">x</a>')
  })
})

describe('compileTemplate', () => {
  it('produces same output as applyVars', () => {
    const tpl = 'Hola {{name}} de {{Empresa}}'
    const contact = { name: 'Ana', company: 'ACME' }
    expect(compileTemplate(tpl).applyTo(contact)).toBe(applyVars(tpl, contact))
  })

  it('is reusable across contacts without state leakage', () => {
    const compiled = compileTemplate('{{name}}')
    expect(compiled.applyTo({ name: 'A' })).toBe('A')
    expect(compiled.applyTo({ name: 'B' })).toBe('B')
    expect(compiled.applyTo({ name: 'A' })).toBe('A')
  })

  it('escapes values in compiled path too', () => {
    const out = compileTemplate('{{name}}').applyTo({ name: '<img onerror=x>' })
    expect(out).not.toContain('<img')
  })

  it('handles empty template', () => {
    expect(compileTemplate('').applyTo({ name: 'x' })).toBe('')
  })
})

describe('conditionals & fallbacks', () => {
  const c = { name: 'Ana', company: '', city: 'Madrid', vip: true, points: 0 }

  it('if / else on presence', () => {
    expect(applyVars('{{#if company}}De {{company}}{{else}}Particular{{/if}}', c)).toBe('Particular')
    expect(applyVars('{{#if name}}Hola {{name}}{{/if}}', c)).toBe('Hola Ana')
  })

  it('unless and nested blocks', () => {
    expect(applyVars('{{#unless company}}sin empresa{{/unless}}', c)).toBe('sin empresa')
    expect(applyVars('{{#if name}}A{{#if vip}}B{{else}}C{{/if}}D{{/if}}', c)).toBe('ABD')
  })

  it('equality comparisons are case-insensitive', () => {
    expect(applyVars('{{#if Ciudad == "madrid"}}MAD{{else}}OTRA{{/if}}', c)).toBe('MAD')
    expect(applyVars('{{#if city != "Madrid"}}x{{else}}y{{/if}}', c)).toBe('y')
  })

  it('falsy values: 0, false, empty', () => {
    expect(applyVars('{{#if points}}p{{else}}np{{/if}}', c)).toBe('np')
    expect(applyVars('{{#if vip}}v{{/if}}', { vip: false })).toBe('')
  })

  it('fallback values, escaped', () => {
    expect(applyVars('Hola {{name | "amigo"}}', {})).toBe('Hola amigo')
    expect(applyVars('Hola {{ Nombre | default: "amiga" }}', { name: 'Eva' })).toBe('Hola Eva')
    expect(applyVars('{{x | "<b>"}}', {})).toBe('&lt;b&gt;')
  })

  it('unknown tags render empty, system placeholders survive', () => {
    expect(applyVars('A{{desconocido}}B {{UNSUBSCRIBE_URL}} {{ COMPANY_ADDRESS }}', {})).toBe('AB {{UNSUBSCRIBE_URL}} {{ COMPANY_ADDRESS }}')
  })

  it('custom fields and accents', () => {
    expect(applyVars('{{puntos_fidelidad}} · {{Población}}', { puntos_fidelidad: 120, city: 'Sevilla' })).toBe('120 · Sevilla')
  })
})
