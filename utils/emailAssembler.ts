// Builds a complete, editable email from an AI block plan using the editor's
// own block library and style bases (browser only: uses DOMParser).
//
// Shared by the editor's AI chat and the two-click campaign generator, so both
// produce identical markup that the editor can keep editing.

import { editorBlocks } from '~/utils/editorBlocks'
import { editorStyleBases } from '~/utils/editorStyles'
import { normalizeEditorAiBlocks, normalizeEditorAiHref } from '~/utils/editorAiBlocks'

export type BlockFields = Partial<Record<'badge' | 'title' | 'subtitle' | 'button' | 'buttonUrl' | 'images' | 'image' | 'logo' | 'price' | 'code' | 'contact' | 'ps' | 'features' | 'socialUrls' | 'videoUrl', string | string[]>>

export interface PlannedBlock {
  id: string
  fields: BlockFields
}

export interface BrandLite {
  name?: string
  logoUrl?: string
  colors?: { primary?: string; secondary?: string; background?: string; text?: string }
  fonts?: { heading?: string; body?: string }
  footer?: string
  website?: string
}

export interface AssembleOptions {
  blocks: PlannedBlock[]
  styleId: string
  brand?: BrandLite | null
  language?: string
  preheader?: string
  title?: string
  /** Turns an image reference (URL, asset:N or prompt) into a final URL, or null to drop it */
  resolveImage?: (ref: string) => Promise<string | null>
  onProgress?: (message: string) => void
}

// Reused when the live editor rebuilds the theme stylesheet after loading a draft.
export const EDITOR_RESPONSIVE_CSS = `
    @media only screen and (max-width: 600px) {
      .header-block, .body-block, .methodology-block, .presence-block, .card-block, .cta-block, .signature-block, .hero-block, .product-block {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .grid-quad-td { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; padding: 4px !important; }
      .main-card .ai-layout-row { display: block !important; width: 100% !important; }
      .main-card .ai-layout-pairs { font-size: 0 !important; }
      .main-card .ai-layout-stack { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; padding-bottom: 12px !important; }
      .main-card .ai-layout-half { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; vertical-align: top !important; padding: 4px !important; }
      .main-card .ai-layout-spacer { display: none !important; }
    }`

const SHELL_CSS = `
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    .main-card { width: 100%; max-width: 820px; margin: 0 auto; overflow: hidden; }
    ${EDITOR_RESPONSIVE_CSS}`

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined || v === null) return []
  // An empty grid/contact slot must not shift every following value left.
  return (Array.isArray(v) ? v : [v]).map(x => String(x ?? '').trim())
}

function safeImageUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() || ''
  if (/placehold\.co|placeholder\.com/i.test(value) || /[\u0000-\u0020\u007f<>"\\]/.test(value)) return null
  if (/^\/uploads\/[^?#]+(?:[?#].*)?$/.test(value) && !value.includes('/../')) return value
  const safe = normalizeEditorAiHref(value)
  return safe && /^https?:\/\//i.test(safe) ? safe : null
}

const INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'SPAN', 'A', 'P', 'UL', 'OL', 'LI'])

/** Model text may contain emphasis, but must not inject layout, editor controls or executable markup. */
function setText(el: Element, html: string) {
  const scratch = el.ownerDocument.createElement('div')
  scratch.innerHTML = html
  scratch.querySelectorAll('script,style,iframe,object,embed,svg,math,template,form,input,button,textarea,link,meta').forEach(node => node.remove())
  for (const node of Array.from(scratch.querySelectorAll('*'))) {
    if (!INLINE_TAGS.has(node.tagName)) { node.replaceWith(...Array.from(node.childNodes)); continue }
    const href = node.tagName === 'A' ? normalizeEditorAiHref(node.getAttribute('href') || '') : null
    for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name)
    if (node.tagName === 'A') {
      if (!href) node.replaceWith(...Array.from(node.childNodes))
      else {
        node.setAttribute('href', href)
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }
  }
  el.innerHTML = scratch.innerHTML
}

function fillFooter(el: Element, lang: string, address: string, custom?: string) {
  const en = lang.startsWith('en')
  const intro = custom?.trim() || (en ? 'You receive this email because you subscribed to our list.' : 'Recibes este email porque te suscribiste a nuestra lista.')
  setText(el, intro)
  for (const [token, label] of [
    ['UNSUBSCRIBE_URL', en ? 'Unsubscribe' : 'Darse de baja'],
    ['PREFERENCES_URL', en ? 'Email preferences' : 'Preferencias de email'],
  ]) {
    const existing = Array.from(el.querySelectorAll('a')).filter(link => new RegExp(`^\\{\\{\\s*${token}\\s*\\}\\}$`).test(link.getAttribute('href') || ''))
    if (existing.length) {
      existing[0].setAttribute('href', `{{${token}}}`)
      existing.slice(1).forEach(link => link.remove())
      continue
    }
    el.appendChild(el.ownerDocument.createElement('br'))
    const link = el.ownerDocument.createElement('a')
    link.setAttribute('href', `{{${token}}}`)
    link.setAttribute('style', 'color:#6366f1;text-decoration:underline;')
    link.textContent = label
    el.appendChild(link)
  }
  if (!(el.textContent || '').includes(address)) {
    el.appendChild(el.ownerDocument.createElement('br'))
    el.appendChild(el.ownerDocument.createTextNode(address))
  }
}

/** Applies a style base (+ brand overrides) to a whole document. */
export function applyStyleToDocument(doc: Document, styleId: string, brand?: BrandLite | null) {
  const base = editorStyleBases.find(s => s.id === styleId) ?? editorStyleBases[0]
  const cfg = { ...base.config }
  if (brand?.colors?.primary) cfg.accentColor = brand.colors.primary
  if (brand?.fonts?.body) cfg.fontFamily = brand.fonts.body
  const headingFont = brand?.fonts?.heading || cfg.fontFamily

  doc.body.style.backgroundColor = cfg.bodyBg
  doc.body.style.fontFamily = cfg.fontFamily
  doc.body.setAttribute('data-style-id', base.id)
  doc.body.setAttribute('data-style-body-bg', cfg.bodyBg)
  doc.body.setAttribute('data-style-card-radius', cfg.cardRadius)
  doc.body.setAttribute('data-style-card-shadow', cfg.cardShadow)
  doc.body.setAttribute('data-style-font-family', cfg.fontFamily)

  const card = doc.querySelector('.main-card') as HTMLElement | null
  if (card) {
    card.style.backgroundColor = cfg.cardBg
    card.style.borderRadius = cfg.cardRadius
    card.style.boxShadow = cfg.cardShadow
    card.style.border = cfg.cardBorder
  }

  doc.querySelectorAll<HTMLElement>('.editable-block').forEach((block) => {
    const isHeader = block.classList.contains('header-block')
    block.style.fontFamily = cfg.fontFamily
    block.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (el.style.fontFamily && el.getAttribute('data-toggle') !== 'badge') el.style.fontFamily = cfg.fontFamily
    })
    if (isHeader) {
      block.style.background = cfg.headerBg
      block.style.backgroundColor = cfg.headerBg
    } else if (!block.classList.contains('unsubscribe-block')) {
      block.style.background = cfg.contentBg
      block.style.backgroundColor = cfg.contentBg
      block.querySelectorAll<HTMLElement>('div, table, td').forEach((el) => {
        if (el.style.backgroundColor || el.getAttribute('bgcolor')) {
          el.style.backgroundColor = cfg.contentBg
          if (el.hasAttribute('bgcolor')) el.setAttribute('bgcolor', cfg.contentBg)
        }
        if (el.style.border && /e2e8f0|226, 232, 240/i.test(el.style.border)) el.style.borderColor = cfg.borderColor
      })
    }
    block.querySelectorAll<HTMLElement>('[data-toggle="title"], [data-toggle="price"]').forEach((el) => {
      el.style.color = isHeader ? cfg.headerText : cfg.titleColor
      el.style.fontFamily = headingFont
      if (cfg.titleLetterSpacing) el.style.letterSpacing = cfg.titleLetterSpacing
    })
    block.querySelectorAll<HTMLElement>('[data-toggle="badge"]').forEach((el) => {
      el.style.color = isHeader ? cfg.headerText : cfg.accentColor
      if (cfg.labelFontFamily) el.style.fontFamily = cfg.labelFontFamily
    })
    block.querySelectorAll<HTMLElement>('[data-toggle="code"]').forEach(el => { el.style.color = cfg.accentColor })
    block.querySelectorAll<HTMLElement>('[data-toggle="subtitle"], [data-toggle="ps"], [data-toggle="contact"], [data-toggle="pricing-feature"]').forEach((el) => {
      el.style.color = isHeader ? cfg.headerText : cfg.subtitleColor
      el.querySelectorAll<HTMLElement>('a').forEach((a) => {
        if (!a.getAttribute('data-toggle')) a.style.color = cfg.accentColor
      })
    })
    block.querySelectorAll<HTMLElement>('[data-toggle="button"]').forEach((btn) => {
      btn.style.borderRadius = cfg.buttonRadius
      btn.style.background = cfg.accentColor
      btn.style.backgroundColor = cfg.accentColor
      // Brand colour is intentional: the editor's theme engine must keep it
      if (brand?.colors?.primary) btn.setAttribute('data-custom-bg', '1')
    })
    if (brand?.fonts?.body) block.setAttribute('data-custom-font', '1')
  })
}

export async function assembleEmail(opts: AssembleOptions): Promise<string> {
  const parser = new DOMParser()
  const lang = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(opts.language || '') ? opts.language! : 'es'
  // Filled by the send pipeline from Settings → company address (CAN-SPAM)
  const address = '{{COMPANY_ADDRESS}}'
  let blocksHtml = ''

  for (const planned of normalizeEditorAiBlocks(opts.blocks).blocks) {
    const def = editorBlocks.find(b => b.id === planned.id)
    if (!def) continue
    const doc = parser.parseFromString(`<div id="root">${def.content}</div>`, 'text/html')
    const root = doc.getElementById('root')!
    const f = planned.fields
    root.querySelector('.editable-block')?.setAttribute('data-ai-block-id', planned.id)
    if (['grid-2', 'grid-3', 'grid-4', 'pricing', 'product'].includes(planned.id)) {
      root.querySelectorAll('tr').forEach(row => {
        row.classList.add('ai-layout-row')
        if (planned.id === 'grid-4') row.classList.add('ai-layout-pairs')
      })
      root.querySelectorAll('td').forEach(cell => cell.classList.add(
        planned.id === 'grid-4' ? 'ai-layout-half' : cell.hasAttribute('valign') ? 'ai-layout-stack' : 'ai-layout-spacer',
      ))
    }

    if (planned.id === 'unsubscribe') {
      const sub = root.querySelector('[data-toggle="subtitle"]')
      const custom = asList(f.subtitle)[0]
      if (sub) fillFooter(sub, lang, address, custom)
      blocksHtml += root.innerHTML
      continue
    }

    for (const key of ['badge', 'title', 'subtitle', 'price', 'code', 'ps', 'features'] as const) {
      const values = asList(f[key])
      root.querySelectorAll(`[data-toggle="${key === 'features' ? 'pricing-feature' : key}"]`).forEach((el, i) => {
        const value = values[i]
        if (!value) { el.remove(); return }
        setText(el, value)
        if (!el.textContent?.trim()) el.remove()
      })
    }

    const buttons = asList(f.button)
    const urls = asList(f.buttonUrl)
    root.querySelectorAll('[data-toggle="button"]').forEach((el, i) => {
      const text = buttons[i]
      const url = normalizeEditorAiHref(urls[i] || '')
      if (!text || !url) { el.remove(); return }
      const label = el.querySelector('.btn-text') || el
      setText(label, text)
      // A button is already an anchor. Nested model-provided anchors are invalid HTML.
      label.querySelectorAll('a').forEach(link => link.replaceWith(...Array.from(link.childNodes)))
      const a = el.tagName === 'A' ? el : el.querySelector('a')
      a?.setAttribute('href', url)
    })

    const contacts = asList(f.contact)
    root.querySelectorAll('[data-toggle="contact"]').forEach((el, i) => {
      const value = contacts[i]
      if (!value) { el.remove(); return }
      const plain = value.trim()
      if (!plain) { el.remove(); return }
      const url = /^[^\s@]+@[^\s@]+$/.test(plain) ? normalizeEditorAiHref(`mailto:${plain}`)
        : /^\+?[\d][\d\s().-]*$/.test(plain) ? normalizeEditorAiHref(`tel:${plain.replace(/[^+\d]/g, '')}`)
          : normalizeEditorAiHref(plain)
      const a = el.tagName === 'A' ? el : el.querySelector('a')
      if (a && url) { a.textContent = plain; a.setAttribute('href', url) }
      else el.textContent = plain
    })

    // Only successfully resolved URLs may replace the native sample images.
    const resolve = async (ref: string): Promise<string | null> => {
      if (!ref) return null
      try { return safeImageUrl(opts.resolveImage ? await opts.resolveImage(ref) : ref) }
      catch { return null }
    }
    const logoEls = root.querySelectorAll('[data-toggle="logo"]')
    if (logoEls.length) {
      const logo = asList(f.logo)[0] || opts.brand?.logoUrl || ''
      const resolved = await resolve(logo)
      logoEls.forEach((el) => {
        const img = el.tagName === 'IMG' ? el : el.querySelector('img')
        if (resolved && img) {
          img.setAttribute('src', resolved)
          img.setAttribute('alt', opts.brand?.name || 'Logo')
        } else el.remove()
      })
    }

    // Content images: resolve each; drop placeholders nobody filled
    const imageRefs = asList(f.images ?? f.image)
    const imageEls = Array.from(root.querySelectorAll('[data-toggle="image"]'))
    for (let i = 0; i < imageEls.length; i++) {
      const el = imageEls[i]
      const ref = imageRefs[i]
      let resolved: string | null = null
      if (ref) {
        opts.onProgress?.('image')
        resolved = await resolve(ref)
      }
      const img = el.tagName === 'IMG' ? el : el.querySelector('img')
      if (resolved && img) {
        img.setAttribute('src', resolved)
        const titles = asList(f.title)
        img.setAttribute('alt', (titles[i] ?? titles[0] ?? '').replace(/<[^>]+>/g, '').slice(0, 120))
      } else el.remove()
    }

    const socialUrls = asList(f.socialUrls)
    root.querySelectorAll('.social-item').forEach((el, i) => {
      const url = normalizeEditorAiHref(socialUrls[i] || '')
      if (!url || !/^https?:\/\//i.test(url)) { el.remove(); return }
      el.setAttribute('href', url)
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    })
    if (planned.id === 'video') {
      const container = root.querySelector('[data-toggle="image"]')
      const videoUrl = normalizeEditorAiHref(asList(f.videoUrl)[0] || '')
      if (container && videoUrl && /^https?:\/\//i.test(videoUrl)) {
        const link = doc.createElement('a')
        link.setAttribute('href', videoUrl)
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener noreferrer')
        link.setAttribute('style', 'display:block;position:relative;text-decoration:none;')
        link.append(...Array.from(container.childNodes))
        container.appendChild(link)
      } else container?.remove()
    }

    // Some native examples include untargeted sample features, social links and
    // decorative text. They must never become claims in a generated campaign.
    root.querySelectorAll('[data-toggle="pricing-features"]').forEach(el => {
      if (!el.querySelector('[data-toggle="pricing-feature"]')) el.remove()
    })
    root.querySelectorAll('a').forEach(link => {
      if (!normalizeEditorAiHref(link.getAttribute('href') || '')) link.remove()
    })
    root.querySelectorAll<HTMLElement>('[style]').forEach(el => {
      if (/placehold\.co|placeholder\.com/i.test(el.getAttribute('style') || '')) el.style.removeProperty('background')
    })
    const boundFields = '[data-toggle="badge"],[data-toggle="title"],[data-toggle="subtitle"],[data-toggle="button"],[data-toggle="contact"],[data-toggle="price"],[data-toggle="code"],[data-toggle="ps"],[data-toggle="pricing-feature"]'
    const removeSampleText = (node: Node) => {
      if (node.nodeType === 3 && node.textContent?.trim() && !node.parentElement?.closest(boundFields)) node.parentNode?.removeChild(node)
      else Array.from(node.childNodes).forEach(removeSampleText)
    }
    removeSampleText(root)
    root.querySelectorAll('.faq-item,.pricing-item,.metric-item,[data-toggle="button-container"]').forEach(el => {
      if (!el.textContent?.trim() && !el.querySelector('img')) el.remove()
    })
    root.querySelectorAll('.presence-block > div:not([data-toggle]), .social-block > div, .pricing-item > div:not([data-toggle])').forEach(el => {
      if (!el.textContent?.trim() && !el.querySelector('img')) el.remove()
    })
    if (['signature', 'product'].includes(planned.id)) {
      const cells = root.querySelectorAll<HTMLElement>('td')
      if (cells.length === 2 && !cells[0].textContent?.trim() && !cells[0].querySelector('img')) {
        cells[0].remove()
        cells[1].setAttribute('width', '100%')
        if (planned.id === 'product') cells[1].style.padding = '20px'
      }
    }
    // Empty modules are omitted; intentional spacing modules remain editable.
    if (!['divider', 'spacer'].includes(planned.id) && !root.textContent?.trim() && !root.querySelector('img')) continue
    blocksHtml += root.innerHTML
  }

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <style>${SHELL_CSS}
  </style>
</head>
<body style="margin:0;padding:0;">
  <div style="margin:0;padding:0;width:100%;">
    <div style="margin:0 auto;padding:0;">
      <div class="main-card" style="width:100%;max-width:820px;margin:0 auto;overflow:hidden;">
        ${blocksHtml}
      </div>
    </div>
  </div>
</body>
</html>`

  const full = parser.parseFromString(html, 'text/html')
  const title = full.createElement('title')
  title.textContent = opts.title || opts.brand?.name || ''
  full.head.prepend(title)
  if (opts.preheader?.trim()) {
    const preheader = full.createElement('div')
    preheader.setAttribute('data-email-preheader', 'true')
    preheader.setAttribute('style', 'display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;')
    preheader.textContent = opts.preheader.trim()
    full.body.prepend(preheader)
  }
  applyStyleToDocument(full, opts.styleId, opts.brand)
  return `<!DOCTYPE html>\n${full.documentElement.outerHTML}`
}

/** Image reference → URL: asset:N from the given list, a URL, or an AI prompt. */
export function imageRefToUrl(ref: string, assets: string[], allowGenerated: boolean): string | null {
  const m = ref.match(/^asset:(\d+)$/)
  if (m) return safeImageUrl(assets[Number(m[1])])
  const url = safeImageUrl(ref)
  if (url) return url
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/')) return null
  if (!allowGenerated || ref.trim().length < 8) return null
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(ref.trim().slice(0, 400))}?width=1200&height=800&nologo=true`
}
