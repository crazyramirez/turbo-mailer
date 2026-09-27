// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { assembleEmail, imageRefToUrl, type PlannedBlock } from '~/utils/emailAssembler'
import { EDITOR_AI_CATALOG, normalizeEditorAiBlocks } from '~/utils/editorAiBlocks'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const assemble = (blocks: PlannedBlock[]) => assembleEmail({ blocks, styleId: 'default' }).then(parse)

describe('editable AI email assembly', () => {
  it('renders each actual module with native editability and no residual demonstration content', async () => {
    const blocks = EDITOR_AI_CATALOG.map(block => ({
      id: block.id,
      fields: Object.fromEntries(Object.entries(block.slots).map(([field, count]) => [field,
        Array.from({ length: count }, (_, i) => ['images', 'logo'].includes(field) ? `/uploads/${block.id}-${i}.png`
          : field === 'buttonUrl' ? `https://viseni.com/${block.id}/${i}` : `${block.id} ${field} ${i}`),
      ])),
    }))
    const doc = await assemble(blocks)
    const nodes = [...doc.querySelectorAll('.editable-block')]
    expect(nodes).toHaveLength(EDITOR_AI_CATALOG.length)
    expect(nodes.every(node => node.hasAttribute('data-type') && node.hasAttribute('data-ai-block-id'))).toBe(true)
    expect(nodes.at(-1)?.classList.contains('unsubscribe-block')).toBe(true)
    expect(doc.body.innerHTML).not.toMatch(/placehold\.co|Alex Rivera|NovaSphere|Carlos Mendoza|TechInnovate|FITUR|Más Popular|Soporte Standard|1\.000 Envíos|CODIGO20|\$29|\$79|\$199/)
    expect(doc.querySelector('a[href="#"]')).toBeNull()
  })

  it('does not repeat the first grid value or move an image into a blank positional slot', async () => {
    const doc = await assemble([{ id: 'grid-3', fields: { title: ['Primero', '', 'Tercero'], subtitle: ['Solo el primero'], images: ['', '/uploads/second.png', ''] } }])
    const cells = doc.querySelectorAll('.grid-block td[valign="top"]')
    expect(cells).toHaveLength(3)
    expect(cells[0].textContent).toContain('Primero')
    expect(cells[0].querySelector('img')).toBeNull()
    expect(cells[1].querySelector('[data-toggle="title"]')).toBeNull()
    expect(cells[1].querySelector('img')?.getAttribute('src')).toBe('/uploads/second.png')
    expect(cells[2].textContent).toContain('Tercero')
    expect(doc.querySelectorAll('[data-toggle="subtitle"]')).toHaveLength(2) // first item and footer
  })

  it('removes missing prices, coupons, buttons and native pricing claims instead of publishing examples', async () => {
    const doc = await assemble([
      { id: 'pricing', fields: { badge: ['Flexible'], title: ['Solicita presupuesto'], subtitle: ['Ajustado a tus necesidades'] } },
      { id: 'product', fields: { title: 'Producto real' } },
      { id: 'coupon', fields: { title: 'Ventaja para suscriptores' } },
    ])
    expect(doc.querySelector('[data-toggle="price"]')).toBeNull()
    expect(doc.querySelector('[data-toggle="code"]')).toBeNull()
    expect(doc.querySelector('[data-toggle="button"]')).toBeNull()
    expect(doc.querySelector('.pricing-features')).toBeNull()
    expect(doc.querySelectorAll('.product-block td')).toHaveLength(1)
    expect(doc.querySelector('.product-block td')?.getAttribute('width')).toBe('100%')
    expect(doc.body.textContent).not.toMatch(/49,00|69,00|\$29|\$79|\$199|CODIGO20|Más Popular|Envíos Ilimitados/)
  })

  it('keeps inline emphasis and safe links while stripping model scripts, layout and editor controls', async () => {
    const doc = await assemble([{ id: 'text', fields: { title: '<b onclick="bad()">Bienvenido</b><br><span style="background:url(javascript:bad())" data-toggle="image" class="editable-block">Hola</span><script>bad()</script><iframe src="https://evil.example">evil</iframe><img src="x" onerror="bad()"><a href="java&#10;script:bad()">No</a><a href="https://viseni.com" onmouseover="bad()">Visítanos</a>' } }])
    const title = doc.querySelector('.body-block [data-toggle="title"]')!
    expect(title.querySelector('b')?.textContent).toBe('Bienvenido')
    expect(title.querySelectorAll('a')).toHaveLength(1)
    expect(title.querySelector('a')?.getAttribute('href')).toBe('https://viseni.com')
    expect(title.innerHTML).not.toMatch(/bad\(|javascript|onclick|onmouseover|onerror|script|iframe|data-toggle|class=|<img|style=/)
    expect(doc.querySelectorAll('.editable-block')).toHaveLength(2)
  })

  it('restores both legal footer links even when a custom footer only supplied unsubscribe', async () => {
    const doc = await assemble([
      { id: 'unsubscribe', fields: { subtitle: 'Tu lista <a href="{{UNSUBSCRIBE_URL}}">Baja</a><script>bad()</script>' } },
      { id: 'text', fields: { title: 'Contenido' } },
      { id: 'unsubscribe', fields: { subtitle: 'Duplicado' } },
    ])
    expect(doc.querySelectorAll('.unsubscribe-block')).toHaveLength(1)
    expect(doc.querySelector('.main-card')?.lastElementChild?.classList.contains('unsubscribe-block')).toBe(true)
    expect(doc.querySelectorAll('a[href="{{UNSUBSCRIBE_URL}}"]')).toHaveLength(1)
    expect(doc.querySelectorAll('a[href="{{PREFERENCES_URL}}"]')).toHaveLength(1)
    expect(doc.querySelector('.unsubscribe-block')?.textContent).toContain('{{COMPANY_ADDRESS}}')
    expect(doc.querySelector('script')).toBeNull()
  })

  it('renders only supplied signature details and creates correct links without inventing a contact', async () => {
    const { blocks } = normalizeEditorAiBlocks([], { signature: { name: 'Marta García', details: 'Atención al cliente', email: '', website: 'viseni.com', phone: '+34 912 345 678', imageUrl: '', ps: '' } })
    const doc = await assemble(blocks)
    const signature = doc.querySelector('.signature-block')!
    expect(signature.querySelector('a[href="mailto:hola@tudominio.com"]')).toBeNull()
    expect(signature.querySelector('a[href="https://viseni.com"]')?.textContent).toBe('viseni.com')
    expect(signature.querySelector('a[href="tel:+34912345678"]')?.textContent).toBe('+34 912 345 678')
    expect(signature.querySelector('[data-toggle="ps"]')).toBeNull()
    expect(signature.querySelector('img')).toBeNull()
    expect(signature.textContent).not.toMatch(/Alex|NovaSphere|P\.D\.|tudominio/)
  })

  it('drops broken, missing and dangerous image results, and accepts self-hosted assets', async () => {
    const html = await assembleEmail({ styleId: 'default', blocks: [
      { id: 'image', fields: { images: 'asset:0' } },
      { id: 'card', fields: { title: 'Disponible sin imagen', images: 'broken' } },
      { id: 'card', fields: { title: 'Contenido seguro', images: 'unsafe' } },
      { id: 'hero', fields: { title: 'Un hero sin imagen de ejemplo' } },
    ], resolveImage: async ref => {
      if (ref === 'broken') throw new Error('Unavailable')
      return ref === 'asset:0' ? '/uploads/real.png' : 'javascript:bad()'
    } })
    const doc = parse(html)
    expect(doc.querySelectorAll('img')).toHaveLength(1)
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('/uploads/real.png')
    expect(html).not.toMatch(/placehold\.co|javascript:|bad\(/)
  })

  it('escapes title and hidden preheader while preserving email personalization and native buttons', async () => {
    const doc = parse(await assembleEmail({ styleId: 'default', language: 'es', title: '<script>Subject</script>', preheader: '<img src=x> Un adelanto', blocks: [
      { id: 'text', fields: { title: 'Hola {{name | "amigo"}}, <strong>bienvenido</strong>' } },
      { id: 'button', fields: { button: '<a href="https://other.example">Conócenos</a>', buttonUrl: '{{WEB_URL}}' } },
    ] }))
    expect(doc.title).toBe('<script>Subject</script>')
    const preheader = doc.querySelector('[data-email-preheader]') as HTMLElement
    expect(preheader.textContent).toBe('<img src=x> Un adelanto')
    expect(preheader.style.display).toBe('none')
    expect(preheader.querySelector('img')).toBeNull()
    expect(doc.querySelector('.body-block')?.textContent).toContain('{{name | "amigo"}}')
    expect(doc.querySelector('[data-toggle="button"] .btn-text')?.textContent).toBe('Conócenos')
    expect(doc.querySelector('[data-toggle="button"] a')).toBeNull()
    expect(doc.querySelector('[data-toggle="button"]')?.getAttribute('href')).toBe('{{WEB_URL}}')
  })
})

describe('AI image references', () => {
  it('supports real assets and upload paths and rejects invalid asset/protocol references', () => {
    expect(imageRefToUrl('asset:0', ['/uploads/brand.png'], false)).toBe('/uploads/brand.png')
    expect(imageRefToUrl('/uploads/photo.png', [], false)).toBe('/uploads/photo.png')
    expect(imageRefToUrl('asset:2', [], true)).toBeNull()
    expect(imageRefToUrl('javascript:alert(1)', [], true)).toBeNull()
    expect(imageRefToUrl('https://placehold.co/100x100', [], false)).toBeNull()
    expect(imageRefToUrl('A mountain photograph', [], false)).toBeNull()
  })
})
