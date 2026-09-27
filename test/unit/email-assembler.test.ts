// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { assembleEmail, EDITOR_RESPONSIVE_CSS, imageRefToUrl, type PlannedBlock } from '~/utils/emailAssembler'
import { EDITOR_AI_CATALOG, normalizeEditorAiBlocks } from '~/utils/editorAiBlocks'
import { editorBlocks } from '~/utils/editorBlocks'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const assemble = (blocks: PlannedBlock[]) => assembleEmail({ blocks, styleId: 'default' }).then(parse)

describe('editable AI email assembly', () => {
  it('renders each actual module with native editability and no residual demonstration content', async () => {
    const blocks = EDITOR_AI_CATALOG.map(block => ({
      id: block.id,
      fields: Object.fromEntries(Object.entries(block.slots).map(([field, count]) => [field,
        Array.from({ length: count }, (_, i) => ['images', 'logo'].includes(field) ? `/uploads/${block.id}-${i}.png`
          : ['buttonUrl', 'videoUrl', 'socialUrls'].includes(field) ? `https://viseni.com/${block.id}/${i}` : `${block.id} ${field} ${i}`),
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

  it('maps nine pricing features to the correct plan and omits only unfilled feature slots', async () => {
    const doc = await assemble([{ id: 'pricing', fields: {
      badge: ['Inicio', 'Equipo', 'Avanzado'], title: ['10 €', '20 €', '30 €'],
      subtitle: ['Para empezar', 'Para colaborar', 'Para crecer'],
      features: ['✓ Función A', '', '✓ Función C', '✓ Asesoría', '', '', '', '', '✓ Integración'],
    } }])
    const plans = doc.querySelectorAll('.pricing-item')
    expect([...plans[0].querySelectorAll('.pricing-feature')].map(el => el.textContent)).toEqual(['✓ Función A', '✓ Función C'])
    expect([...plans[1].querySelectorAll('.pricing-feature')].map(el => el.textContent)).toEqual(['✓ Asesoría'])
    expect([...plans[2].querySelectorAll('.pricing-feature')].map(el => el.textContent)).toEqual(['✓ Integración'])
    expect(doc.body.textContent).not.toMatch(/Soporte Standard|Account Manager|10\.000 Envíos/)
  })

  it('keeps actual prices, plan features and coupon codes legible on the dark-gold background', async () => {
    const doc = parse(await assembleEmail({ styleId: 'dark-gold', blocks: [
      { id: 'product', fields: { title: 'Producto', price: '49,00 €' } },
      { id: 'pricing', fields: { title: ['10 €'], features: ['Asesoría incluida'] } },
      { id: 'coupon', fields: { title: 'Descuento confirmado', code: 'CLIENTE10' } },
    ] }))
    const price = doc.querySelector<HTMLElement>('[data-toggle="price"]')!
    const feature = doc.querySelector<HTMLElement>('[data-toggle="pricing-feature"]')!
    const code = doc.querySelector<HTMLElement>('[data-toggle="code"]')!
    expect(doc.querySelector<HTMLElement>('.product-block')!.style.backgroundColor).toBe('#0f172a')
    expect(price.style.color).toBe('#ffffff')
    expect(feature.style.color).toBe('#94a3b8')
    expect(code.style.color).toBe('#f59e0b')
    expect(price.textContent).toBe('49,00 €')
    expect(feature.textContent).toBe('Asesoría incluida')
    expect(code.textContent).toBe('CLIENTE10')
  })

  it('uses supplied presence details and real social destinations without filling empty social slots', async () => {
    const doc = await assemble([
      { id: 'presence', fields: { badge: 'NOS ENCONTRARÁS EN', subtitle: 'Encuentro de diseño de Madrid' } },
      { id: 'socials', fields: { title: 'Sigue nuestras novedades', socialUrls: ['', 'https://instagram.com/viseni', 'https://linkedin.com/company/viseni', 'javascript:bad()'] } },
    ])
    expect(doc.querySelector('.presence-block [data-toggle="subtitle"]')?.textContent).toBe('Encuentro de diseño de Madrid')
    const links = doc.querySelectorAll('.social-item')
    expect([...links].map(link => link.getAttribute('href'))).toEqual(['https://instagram.com/viseni', 'https://linkedin.com/company/viseni'])
    expect([...links].map(link => link.querySelector('img')?.getAttribute('alt'))).toEqual(['Instagram', 'LinkedIn'])
    expect(doc.body.innerHTML).not.toMatch(/FITUR|Twitter|Facebook|javascript:/)
  })

  it('turns the native video image into a playable destination without placeholder links', async () => {
    const doc = await assemble([{ id: 'video', fields: { images: '/uploads/demo.png', subtitle: 'Así funciona nuestro servicio', videoUrl: 'https://viseni.com/demo' } }])
    const image = doc.querySelector('.video-block [data-toggle="image"] img')!
    expect(image.getAttribute('src')).toBe('/uploads/demo.png')
    expect(image.closest('a')?.getAttribute('href')).toBe('https://viseni.com/demo')
    expect(doc.querySelector('a[href="#"]')).toBeNull()
    const unavailable = await assemble([{ id: 'video', fields: { images: '/uploads/demo.png', videoUrl: 'data:text/html,bad' } }])
    expect(unavailable.querySelector('.video-block')).toBeNull()
  })

  it('stacks native layouts on mobile while keeping the four-column grid in two columns', async () => {
    const html = await assembleEmail({ styleId: 'default', blocks: [
      { id: 'grid-3', fields: { title: ['A', 'B', 'C'] } },
      { id: 'grid-4', fields: { title: ['A', 'B', 'C', 'D'] } },
      { id: 'pricing', fields: { title: ['10 €', '20 €', '30 €'] } },
      { id: 'product', fields: { title: 'Producto', images: '/uploads/product.png' } },
    ] })
    const mobile = new Window({ width: 375 })
    mobile.document.write(html)
    const stacks = mobile.document.querySelectorAll('.ai-layout-stack')
    expect(stacks).toHaveLength(8)
    for (const cell of stacks) {
      expect(mobile.getComputedStyle(cell).display).toBe('block')
      expect(mobile.getComputedStyle(cell).width).toBe('100%')
    }
    for (const cell of mobile.document.querySelectorAll('.ai-layout-half')) {
      expect(mobile.getComputedStyle(cell).width).toBe('50%')
    }
    for (const cell of mobile.document.querySelectorAll('.ai-layout-spacer')) {
      expect(mobile.getComputedStyle(cell).display).toBe('none')
    }
    const desktop = new Window({ width: 1024 })
    desktop.document.write(html)
    const desktopCell = desktop.document.querySelector('.ai-layout-stack')!
    expect(desktop.getComputedStyle(desktopCell).display).not.toBe('block')
    expect(desktopCell.getAttribute('width')).toBe('31%')
    await desktop.happyDOM.close()
    await mobile.happyDOM.close()
  })

  it('keeps a manually inserted Grid Trío contained and stacks all three editable cards on mobile', async () => {
    const grid = editorBlocks.find(block => block.id === 'grid-3')!
    const html = `<html><head><style>${EDITOR_RESPONSIVE_CSS}</style></head><body>${grid.content}</body></html>`
    const desktop = new Window({ width: 820 })
    const mobile = new Window({ width: 375 })
    try {
      for (const browser of [desktop, mobile]) {
        browser.document.write(html)
        const table = browser.document.querySelector('table')!
        expect(browser.getComputedStyle(table).tableLayout).toBe('fixed')
        expect(browser.document.querySelectorAll('[data-toggle="title"]')).toHaveLength(3)
        expect(browser.document.querySelectorAll('[data-toggle="subtitle"]')).toHaveLength(3)
        expect(browser.document.querySelectorAll('[data-toggle="image"]')).toHaveLength(3)
        // Manual blocks do not pass through the assembler's AI layout tagging.
        expect(browser.document.querySelector('.ai-layout-stack')).toBeNull()
      }
      for (const card of desktop.document.querySelectorAll('td[valign="top"] > div')) {
        expect(desktop.getComputedStyle(card).overflowWrap).toBe('anywhere')
      }
      for (const image of desktop.document.querySelectorAll('.grid-img')) {
        expect(desktop.getComputedStyle(image).maxWidth).toBe('100%')
      }
      for (const cell of desktop.document.querySelectorAll('td[valign="top"]')) {
        expect(desktop.getComputedStyle(cell).display).not.toBe('block')
      }
      for (const cell of mobile.document.querySelectorAll('td[valign="top"]')) {
        expect(mobile.getComputedStyle(cell).display).toBe('block')
        expect(mobile.getComputedStyle(cell).width).toBe('100%')
      }
      for (const spacer of mobile.document.querySelectorAll('td:not([valign])')) {
        expect(mobile.getComputedStyle(spacer).display).toBe('none')
      }
    } finally {
      await desktop.happyDOM.close()
      await mobile.happyDOM.close()
    }
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

  it('preserves literal confirmed signature text, multiline details and URL query strings', async () => {
    const { blocks } = normalizeEditorAiBlocks([], { signature: {
      name: 'Marta <Ventas>', details: 'Dirección comercial\nDiseño & desarrollo', email: '',
      website: 'https://viseni.com/?source=email&copy=2', phone: '', imageUrl: '', ps: 'Tu propuesta <a medida>',
    } })
    const doc = await assemble(blocks)
    expect(doc.querySelector('.signature-block [data-toggle="title"]')?.textContent).toBe('Marta <Ventas>')
    expect(doc.querySelector('.signature-block [data-toggle="subtitle"] br')).not.toBeNull()
    expect(doc.querySelector('.signature-block [data-toggle="subtitle"]')?.textContent).toBe('Dirección comercialDiseño & desarrollo')
    expect(doc.querySelector('.signature-block a')?.getAttribute('href')).toBe('https://viseni.com/?source=email&copy=2')
    expect(doc.querySelector('.signature-block [data-toggle="ps"]')?.textContent).toBe('Tu propuesta <a medida>')
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
