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
    expect(applyVars('Hola {{name}}!', {})).toBe('Hola !')
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
