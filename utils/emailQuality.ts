import { normalizeEditorAiHref } from '~/utils/editorAiBlocks'

export const QUALITY_WIDTHS = [320, 375, 600, 820] as const
export type QualityCode = 'empty' | 'overflow' | 'link' | 'image_alt' | 'image_source' | 'image_failed' | 'small_text' | 'contrast' | 'placeholder'
export interface QualityIssue {
  code: QualityCode
  severity: 'error' | 'warning'
  blockIndex: number
  blockLabel: string
  detail: string
  widths: number[]
}
export interface QualityReport {
  issues: QualityIssue[]
  widths: number[]
  blocks: number
  bytes: number
}

export function qualityBlocks(doc: Document): HTMLElement[] {
  const root = doc.querySelector('.main-card') || doc.body
  return Array.from(root.children).filter((el): el is HTMLElement =>
    !['STYLE', 'SCRIPT', 'NOSCRIPT'].includes(el.tagName) && !el.hasAttribute('data-ignore-save'),
  ) as HTMLElement[]
}

const sample = (el: Element) => (el.textContent || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 80)
function issueFor(code: QualityCode, block: HTMLElement, blockIndex: number, detail = ''): QualityIssue {
  return { code, severity: ['overflow', 'link', 'image_source', 'image_failed', 'empty'].includes(code) ? 'error' : 'warning',
    blockIndex, blockLabel: block.dataset.type || sample(block).slice(0, 35), detail, widths: [] }
}

/** Content checks use the exported HTML, without making requests to linked sites. */
export function inspectEmailContent(doc: Document): QualityIssue[] {
  const blocks = qualityBlocks(doc)
  if (!blocks.length) return [{ code: 'empty', severity: 'error', blockIndex: -1, blockLabel: '', detail: '', widths: [] }]
  const issues: QualityIssue[] = []
  blocks.forEach((block, index) => {
    const links = [...(block.matches('a') ? [block as HTMLAnchorElement] : []), ...block.querySelectorAll('a')]
    links.forEach(link => {
      const href = link.getAttribute('href')?.trim() || ''
      if (href === '{{URL}}' || !normalizeEditorAiHref(href) || (!sample(link) && !link.querySelector('img')?.getAttribute('alt')?.trim())) issues.push(issueFor('link', block, index, sample(link) || href))
    })
    const images = [...(block.matches('img') ? [block as HTMLImageElement] : []), ...block.querySelectorAll('img')]
    images.forEach(img => {
      const src = img.getAttribute('src')?.trim() || ''
      if (!src || /^(?:javascript|file):/i.test(src)) issues.push(issueFor('image_source', block, index, sample(img)))
      if (!img.getAttribute('alt')?.trim() && img.getAttribute('role') !== 'presentation') issues.push(issueFor('image_alt', block, index, sample(img)))
      if (/placehold\.co|placeholder\.com/i.test(src)) issues.push(issueFor('placeholder', block, index, sample(img)))
    })
    if (/lorem ipsum|título [1-4]|breve descripción aquí|tu propuesta de valor principal|describe aquí/i.test(block.textContent || '')) {
      issues.push(issueFor('placeholder', block, index, sample(block)))
    }
  })
  return mergeQualityIssues(issues)
}

function rgb(raw: string): number[] | null {
  const match = raw.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/)
  if (!match || (match[4] !== undefined && Number(match[4]) < 1)) return null
  return match.slice(1, 4).map(Number)
}
function luminance(color: number[]): number {
  const linear = color.map(c => c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}
function background(el: Element, win: Window): number[] | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const css = win.getComputedStyle(node)
    if (css.backgroundImage && css.backgroundImage !== 'none') return null
    const color = rgb(css.backgroundColor)
    if (color) return color
    // Translucent surfaces require compositing; don't guess their contrast.
    if (css.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)'].includes(css.backgroundColor)) return null
  }
  return [255, 255, 255]
}

/** Run against a rendered document at its actual CSS viewport width. */
export function inspectEmailLayout(doc: Document, width: number): QualityIssue[] {
  const win = doc.defaultView
  if (!win) return []
  const issues: QualityIssue[] = []
  qualityBlocks(doc).forEach((block, index) => {
    const elements = [block, ...Array.from(block.querySelectorAll<HTMLElement>('*'))]
    const add = (code: QualityCode, detail = '') => {
      if (issues.some(issue => issue.blockIndex === index && issue.code === code)) return
      issues.push({ ...issueFor(code, block, index, detail), widths: [width] })
    }
    for (const el of elements) {
      let hidden = false
      for (let parent: Element | null = el; parent; parent = parent.parentElement) {
        const parentStyle = win.getComputedStyle(parent)
        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') { hidden = true; break }
      }
      if (hidden) continue
      const css = win.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      if (css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0' || !rect.width || !rect.height) continue
      if (rect.right > width + 2 || rect.left < -2 || (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && ['hidden', 'clip'].includes(css.overflowX))) add('overflow', sample(el))
      if (el.tagName === 'IMG') {
        const img = el as HTMLImageElement
        if (img.complete && !img.naturalWidth && img.getAttribute('src')) add('image_failed', img.alt)
      }
      if (!Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent?.trim())) continue
      const size = parseFloat(css.fontSize)
      if (size > 0 && size < 12) add('small_text', sample(el))
      const foreground = rgb(css.color), bg = background(el, win)
      if (foreground && bg) {
        const l1 = luminance(foreground), l2 = luminance(bg)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        const large = size >= 24 || (size >= 18.66 && Number(css.fontWeight) >= 700)
        if (ratio < (large ? 3 : 4.5)) add('contrast', sample(el))
      }
    }
  })
  return issues
}

export function mergeQualityIssues(issues: QualityIssue[]): QualityIssue[] {
  const merged = new Map<string, QualityIssue>()
  for (const issue of issues) {
    const key = `${issue.blockIndex}:${issue.code}`
    const existing = merged.get(key)
    if (existing) existing.widths = [...new Set([...existing.widths, ...issue.widths])]
    else merged.set(key, { ...issue, widths: [...issue.widths] })
  }
  return [...merged.values()].sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error') || a.blockIndex - b.blockIndex)
}

/** Isolate the review from executable content and editor controls. */
export function prepareQualityDocument(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, iframe, object, embed, base, meta[http-equiv], [data-ignore-save], #editor-styles').forEach(el => el.remove())
  doc.querySelectorAll('*').forEach(el => {
    for (const attribute of Array.from(el.attributes)) if (/^on/i.test(attribute.name)) el.removeAttribute(attribute.name)
  })
  const policy = doc.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'"
  doc.head.prepend(policy)
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
}
