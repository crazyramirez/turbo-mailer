// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { inspectEmailContent, inspectEmailLayout, mergeQualityIssues, prepareQualityDocument, qualityBlocks, type QualityIssue } from '~/utils/emailQuality'

// DOMParser is inert in browsers; happy-dom additionally needs script and
// resource loading disabled when parsing the hostile review fixtures.
const settings = (window as unknown as Window).happyDOM.settings
settings.disableJavaScriptEvaluation = true
settings.disableJavaScriptFileLoading = true
settings.disableCSSFileLoading = true
settings.disableIframePageLoading = true

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const content = (html: string) => inspectEmailContent(parse(`<div class="main-card">${html}</div>`))

afterEach(() => vi.restoreAllMocks())

describe('email quality content checks', () => {
  it('checks links and images that are the root of an imported block', () => {
    const issues = content('<a href="#">Comprar</a><img src="" alt="">')
    expect(issues.map(issue => [issue.blockIndex, issue.code])).toEqual([[0, 'link'], [1, 'image_source'], [1, 'image_alt']])
  })
  it('accepts real URLs, email and phone actions, and system links resolved when sending', () => {
    const links = ['https://marca.es/catalogo', 'http://marca.es/info', 'mailto:info@marca.es', 'tel:+34611222333',
      '{{UNSUBSCRIBE_URL}}', '{{ PREFERENCES_URL }}', '{{WEB_VERSION_URL}}']
    expect(content(`<section>${links.map(href => `<a href="${href}">Acción real</a>`).join('')}</section>`)).toEqual([])
  })

  it.each(['', '#', '{{URL}}', 'javascript:alert(1)', 'file:///private.txt', 'sin-destino'])('reports unusable link destinations (%s)', href => {
    expect(content(`<section data-type="Acción"><a href="${href}">Ver colección</a></section>`)).toEqual([
      expect.objectContaining({ code: 'link', severity: 'error', blockIndex: 0, blockLabel: 'Acción' }),
    ])
  })

  it('reports empty link labels but accepts a linked image with an accessible description', () => {
    expect(content('<section><a href="https://marca.es"></a></section>').map(issue => issue.code)).toEqual(['link'])
    expect(content('<section><a href="https://marca.es"><img src="/uploads/logo.png" alt="Visitar Marca"></a></section>')).toEqual([])
  })

  it('distinguishes missing alt text from an explicitly decorative image', () => {
    expect(content('<section data-type="Imagen"><img src="/uploads/producto.png"></section>').map(issue => issue.code)).toEqual(['image_alt'])
    expect(content('<section><img src="/uploads/separador.png" alt="" role="presentation"></section>')).toEqual([])
    expect(content('<section><img src="/uploads/producto.png" alt="Lámpara de roble"></section>')).toEqual([])
  })

  it('reports empty or unsafe image sources', () => {
    const issues = content('<section><img alt="Producto"></section><section><img src="javascript:alert(1)" alt="Producto"></section>')
    expect(issues.map(issue => [issue.code, issue.blockIndex, issue.severity])).toEqual([
      ['image_source', 0, 'error'], ['image_source', 1, 'error'],
    ])
  })

  it('detects demonstration copy and placeholder photography without duplicating a block warning', () => {
    const issues = content('<section data-type="Tarjeta"><img src="https://placehold.co/400x300" alt="Imagen de ejemplo"><h2>Título 1</h2><p>Breve descripción aquí.</p></section>')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'placeholder', severity: 'warning', blockIndex: 0, blockLabel: 'Tarjeta' })
  })

  it('reports an empty design and excludes editor controls and styles from block indexing', () => {
    expect(content('<style>.a{color:red}</style><div data-ignore-save>Control</div>')).toEqual([
      { code: 'empty', severity: 'error', blockIndex: -1, blockLabel: '', detail: '', widths: [] },
    ])
    const doc = parse('<div class="main-card"><style>.a{color:red}</style><button data-ignore-save>Control</button><section data-type="Texto">Mensaje</section><script>ignored()</script></div>')
    expect(qualityBlocks(doc).map(block => block.dataset.type)).toEqual(['Texto'])
  })
})

/** happy-dom does not render: every measured rectangle/style below is explicit. */
function rendered(html: string) {
  const win = new Window()
  win.document.body.innerHTML = `<div class="main-card">${html}</div>`
  const doc = win.document as unknown as Document
  const styles = new Map<Element, Partial<CSSStyleDeclaration>>()
  const defaults = {
    display: 'block', visibility: 'visible', opacity: '1', overflowX: 'visible',
    fontSize: '16px', fontWeight: '400', color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)', backgroundImage: 'none',
  }
  vi.spyOn(win, 'getComputedStyle').mockImplementation(el => ({ ...defaults, ...styles.get(el as unknown as Element) }) as any)
  const measure = (selector: string, patch: { left?: number; width?: number; height?: number; clientWidth?: number; scrollWidth?: number } = {}) => {
    const element = doc.querySelector<HTMLElement>(selector)!
    const { left = 0, width = 300, height = 40, clientWidth = width, scrollWidth = width } = patch
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left, top: 0, right: left + width, bottom: height, x: left, y: 0, width, height, toJSON: () => ({}) })
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth })
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth })
    return element
  }
  for (const [index, element] of Array.from(doc.querySelectorAll('.main-card, .main-card *')).entries()) {
    element.setAttribute('data-measure', String(index))
    measure(`[data-measure="${index}"]`)
  }
  return { doc, styles, measure }
}

describe('email quality rendered layout checks', () => {
  it('reports overflow at the affected viewport and clears it when the same geometry fits', () => {
    const { doc, measure } = rendered('<section data-type="Grid"><p id="wide">Tarjetas</p></section>')
    measure('#wide', { width: 360 })
    expect(inspectEmailLayout(doc, 320)).toEqual([
      expect.objectContaining({ code: 'overflow', severity: 'error', blockIndex: 0, widths: [320] }),
    ])
    expect(inspectEmailLayout(doc, 375)).toEqual([])
  })

  it('detects clipped content inside a fitting box and content extending beyond the left edge', () => {
    const { doc, measure, styles } = rendered('<section><div id="clip">Texto cortado</div></section><section><div id="left">Desplazado</div></section>')
    styles.set(measure('#clip', { width: 200, scrollWidth: 260 }), { overflowX: 'hidden' })
    measure('#left', { left: -10, width: 200 })
    expect(inspectEmailLayout(doc, 320).map(issue => [issue.code, issue.blockIndex])).toEqual([['overflow', 0], ['overflow', 1]])
  })

  it('flags small text and insufficient contrast, using the larger-type threshold for display headlines', () => {
    const { doc, styles, measure } = rendered('<section><p id="small">Condiciones legibles</p></section><section><h1 id="large">Una gran idea</h1></section><section><p id="body">Lectura principal</p></section>')
    styles.set(measure('#small'), { fontSize: '11px', color: 'rgb(190, 190, 190)' })
    styles.set(measure('#large'), { fontSize: '24px', color: 'rgb(140, 140, 140)' })
    styles.set(measure('#body'), { fontSize: '16px', color: 'rgb(140, 140, 140)' })
    expect(inspectEmailLayout(doc, 375).map(issue => [issue.code, issue.blockIndex])).toEqual([
      ['small_text', 0], ['contrast', 0], ['contrast', 2],
    ])
  })

  it.each([{ display: 'none' }, { visibility: 'hidden' }, { opacity: '0' }])('ignores hidden text and geometry (%j)', hidden => {
    const { doc, styles, measure } = rendered('<section><p id="hidden">Texto oculto</p></section>')
    styles.set(measure('#hidden', { width: 600 }), { ...hidden, fontSize: '9px', color: 'rgb(230, 230, 230)' })
    expect(inspectEmailLayout(doc, 320)).toEqual([])
  })

  it('ignores descendants of an invisible wrapper even when their own opacity and rectangles are measurable', () => {
    const { doc, styles, measure } = rendered('<section id="wrapper"><p id="hidden">Texto oculto</p></section>')
    styles.set(measure('#wrapper'), { opacity: '0' })
    styles.set(measure('#hidden', { width: 600 }), { fontSize: '9px', color: 'rgb(230, 230, 230)' })
    expect(inspectEmailLayout(doc, 320)).toEqual([])
  })

  it('does not guess contrast on image backgrounds or translucent surfaces', () => {
    const { doc, styles, measure } = rendered('<section><p id="photo">Sobre fotografía</p><p id="alpha">Sobre transparencia</p></section>')
    styles.set(measure('#photo'), { color: 'rgb(250, 250, 250)', backgroundImage: 'url(/uploads/foto.png)' })
    styles.set(measure('#alpha'), { color: 'rgb(250, 250, 250)', backgroundColor: 'rgba(255, 255, 255, 0.5)' })
    expect(inspectEmailLayout(doc, 375)).toEqual([])
  })

  it('reports a completed failed image load without treating an image still loading as a failure', () => {
    const { doc } = rendered('<section><img id="failed" src="/uploads/missing.png" alt="Producto"></section><section><img id="pending" src="/uploads/pending.png" alt="Otro producto"></section>')
    for (const [id, complete] of [['failed', true], ['pending', false]] as const) {
      const img = doc.querySelector(`#${id}`)!
      Object.defineProperty(img, 'complete', { configurable: true, value: complete })
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 0 })
    }
    expect(inspectEmailLayout(doc, 375)).toEqual([
      expect.objectContaining({ code: 'image_failed', severity: 'error', blockIndex: 0, detail: 'Producto', widths: [375] }),
    ])
  })
})

describe('quality report merging and isolated review document', () => {
  it('deduplicates one issue per block and code, merges viewport widths and keeps errors first without mutating inputs', () => {
    const issue = (code: QualityIssue['code'], severity: QualityIssue['severity'], blockIndex: number, widths: number[]): QualityIssue => ({ code, severity, blockIndex, widths, blockLabel: 'Bloque', detail: 'Detalle' })
    const issues = [issue('contrast', 'warning', 0, [320]), issue('overflow', 'error', 2, [320]), issue('contrast', 'warning', 0, [375, 320]), issue('overflow', 'error', 2, [600]), issue('link', 'error', 1, [])]
    const original = structuredClone(issues)
    expect(mergeQualityIssues(issues).map(item => [item.code, item.blockIndex, item.widths])).toEqual([
      ['link', 1, []], ['overflow', 2, [320, 600]], ['contrast', 0, [320, 375]],
    ])
    expect(issues).toEqual(original)
  })

  it('removes executable content, handlers and refresh redirects while retaining the email CSS and editable content', () => {
    const html = `<html><head><style id="email-theme">@media(max-width:600px){.card{padding:20px}} .card{color:#123456}</style>
      <style id="editor-styles">.selected{outline:2px solid red}</style><meta http-equiv="refresh" content="0;url=https://untrusted.invalid"><base href="https://untrusted.invalid"></head>
      <body onload="run()"><div class="main-card"><section class="card" data-type="Texto" onclick="run()"><p>Contenido real</p><img src="/uploads/foto.png" alt="Producto" onerror="run()"></section><button data-ignore-save>Editar</button></div>
      <script>run()</script><iframe srcdoc="payload"></iframe><object data="payload"></object><embed src="payload"></body></html>`
    const output = prepareQualityDocument(html)
    const doc = parse(output)
    expect(output).toMatch(/^<!DOCTYPE html>/)
    expect(doc.querySelector('script, iframe, object, embed, base, #editor-styles, [data-ignore-save], [onload], [onclick], [onerror]')).toBeNull()
    expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull()
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("script-src 'none'")
    expect(doc.querySelector('#email-theme')?.textContent).toContain('@media(max-width:600px)')
    expect(doc.querySelector('.card')?.textContent).toBe('Contenido real')
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('/uploads/foto.png')
  })
})
