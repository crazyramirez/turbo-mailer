import { describe, expect, it } from 'vitest'
import { EDITOR_AI_CATALOG, EDITOR_AI_BLOCK_IDS, EDITOR_AI_STYLE_IDS, normalizeEditorAiBlocks, normalizeEditorAiHref } from '~/utils/editorAiBlocks'
import { editorBlocks } from '~/utils/editorBlocks'
import { editorStyleBases } from '~/utils/editorStyles'

describe('native AI module contract (usable on the server without DOMParser)', () => {
  it('covers every native module and style and exposes real repeated slot counts', () => {
    expect(EDITOR_AI_BLOCK_IDS).toEqual(editorBlocks.map(block => block.id))
    expect(EDITOR_AI_STYLE_IDS).toEqual(editorStyleBases.map(style => style.id))
    expect(EDITOR_AI_CATALOG.find(block => block.id === 'grid-4')?.slots).toEqual({ images: 4, title: 4, subtitle: 4 })
    expect(EDITOR_AI_CATALOG.find(block => block.id === 'pricing')?.slots).toEqual({ badge: 3, title: 3, subtitle: 3, button: 3, buttonUrl: 3 })
    expect(EDITOR_AI_CATALOG.find(block => block.id === 'signature')?.slots.contact).toBe(3)
  })

  it('rejects unknown fields and modules, trims excess values, and preserves blank positions', () => {
    const result = normalizeEditorAiBlocks([
      { id: 'custom-html', fields: { html: '<script>evil()</script>' } },
      { id: 'grid-3', fields: { title: ['A', '', 'C', 'too many'], subtitle: ['', 'second'], code: 'NOT-A-COUPON' } },
      { id: 'product', fields: { title: { unexpected: true }, price: 999 } },
    ])
    expect(result.blocks).toEqual([
      { id: 'grid-3', fields: { title: ['A', '', 'C'], subtitle: ['', 'second'] } },
      { id: 'product', fields: { title: '', price: '' } },
      { id: 'unsubscribe', fields: {} },
    ])
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('uses the confirmed CTA only for populated button slots and keeps specific valid URLs', () => {
    const { blocks } = normalizeEditorAiBlocks([
      { id: 'pricing', fields: { button: ['Comprar', '', 'Empresa'], buttonUrl: ['javascript:alert(1)', '', 'https://example.com/business'] } },
    ], { ctaUrl: 'example.com/catalog' })
    expect(blocks[0].fields.buttonUrl).toEqual(['https://example.com/catalog', '', 'https://example.com/business'])
  })

  it('accepts empty fields from a shared strict schema without generating false warnings', () => {
    const { blocks, warnings } = normalizeEditorAiBlocks([{ id: 'text', fields: { title: ['Una campaña'], price: [], images: [], contact: ['', ''] } }])
    expect(blocks[0].fields).toEqual({ title: 'Una campaña' })
    expect(warnings).toEqual([])
  })

  it('replaces model signatures with exactly the approved values before the single final footer', () => {
    const signature = { name: 'Marta', details: 'Equipo de atención', email: '', website: 'viseni.com', phone: '+34 912 345 678', imageUrl: '/uploads/marta.png', ps: '' }
    const { blocks } = normalizeEditorAiBlocks([
      { id: 'unsubscribe', fields: { subtitle: 'Recibes nuestras novedades.' } },
      { id: 'signature', fields: { title: 'Invented', contact: ['invented@example.com'] } },
      { id: 'text', fields: { title: 'Nuestra campaña' } },
      { id: 'unsubscribe', fields: {} },
    ], { signature, includeSignature: true })
    expect(blocks.map(block => block.id)).toEqual(['text', 'signature', 'unsubscribe'])
    expect(blocks[1].fields).toEqual({ title: 'Marta', subtitle: 'Equipo de atención', contact: ['', 'viseni.com', '+34 912 345 678'], images: '/uploads/marta.png', ps: '' })
    expect(blocks[2].fields.subtitle).toBe('Recibes nuestras novedades.')
  })

  it('honors the decision to omit a signature even when the model includes one', () => {
    const source = [{ id: 'signature', fields: { title: 'Invented' } }]
    expect(normalizeEditorAiBlocks(source, { signature: null }).blocks.map(block => block.id)).toEqual(['unsubscribe'])
    expect(normalizeEditorAiBlocks(source, { includeSignature: false }).blocks.map(block => block.id)).toEqual(['unsubscribe'])
  })

  it.each(['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,hi', '//evil.example', '#', '/relative', 'https://', 'https://user:pass@example.com', 'vbscript:bad()'])('rejects unusable or executable links: %s', value => {
    expect(normalizeEditorAiHref(value)).toBeNull()
  })

  it.each(['https://example.com/path?q=1', 'mailto:hello@example.com', 'tel:+34912345678', '{{UNSUBSCRIBE_URL}}', '{{WEB_URL}}'])('preserves safe email links: %s', value => {
    expect(normalizeEditorAiHref(value)).toBe(value)
  })
})
