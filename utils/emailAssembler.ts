// Builds a complete, editable email from an AI block plan using the editor's
// own block library and style bases (browser only: uses DOMParser).
//
// Shared by the editor's AI chat and the two-click campaign generator, so both
// produce identical markup that the editor can keep editing.

import { editorBlocks } from '~/utils/editorBlocks'
import { editorStyleBases } from '~/utils/editorStyles'

export type BlockFields = Partial<Record<'badge' | 'title' | 'subtitle' | 'button' | 'buttonUrl' | 'images' | 'image' | 'logo' | 'price' | 'code' | 'contact' | 'ps', string | string[]>>

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
  /** Turns an image reference (URL, asset:N or prompt) into a final URL, or null to drop it */
  resolveImage?: (ref: string) => Promise<string | null>
  onProgress?: (message: string) => void
}

const SHELL_CSS = `
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    .main-card { width: 100%; max-width: 820px; margin: 0 auto; overflow: hidden; }
    @media only screen and (max-width: 600px) {
      .header-block, .body-block, .methodology-block, .presence-block, .card-block, .cta-block, .signature-block, .hero-block, .product-block {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .grid-quad-td { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; padding: 4px !important; }
    }`

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined || v === null) return []
  return (Array.isArray(v) ? v : [v]).map(x => String(x ?? '')).filter(x => x.trim() !== '')
}

function safeHref(url: string): string {
  const u = url.trim()
  if (/^(https?:|mailto:|tel:)/i.test(u) || /^\{\{\s*[A-Z_]+\s*\}\}$/.test(u)) return u
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return `https://${u}`
  return '#'
}

function setText(el: Element, html: string) {
  el.innerHTML = html
}

function unsubscribeHtml(lang: string, address: string, custom?: string): string {
  const en = lang.startsWith('en')
  const intro = custom?.trim() || (en ? 'You receive this email because you subscribed to our list.' : 'Recibes este email porque te suscribiste a nuestra lista.')
  const unsub = en ? 'Unsubscribe' : 'Darse de baja'
  const prefs = en ? 'Email preferences' : 'Preferencias de email'
  return `${intro}<br><a href="{{UNSUBSCRIBE_URL}}" style="color:#6366f1;text-decoration:underline;">${unsub}</a> · <a href="{{PREFERENCES_URL}}" style="color:#6366f1;text-decoration:underline;">${prefs}</a>${address ? `<br>${address}` : ''}`
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
    block.querySelectorAll<HTMLElement>('[data-toggle="title"]').forEach((el) => {
      el.style.color = isHeader ? cfg.headerText : cfg.titleColor
      el.style.fontFamily = headingFont
      if (cfg.titleLetterSpacing) el.style.letterSpacing = cfg.titleLetterSpacing
    })
    block.querySelectorAll<HTMLElement>('[data-toggle="badge"]').forEach((el) => {
      el.style.color = isHeader ? cfg.headerText : cfg.accentColor
      if (cfg.labelFontFamily) el.style.fontFamily = cfg.labelFontFamily
    })
    block.querySelectorAll<HTMLElement>('[data-toggle="subtitle"], [data-toggle="ps"], [data-toggle="contact"]').forEach((el) => {
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
  const lang = opts.language || 'es'
  // Filled by the send pipeline from Settings → company address (CAN-SPAM)
  const address = '{{COMPANY_ADDRESS}}'
  let blocksHtml = ''

  for (const planned of opts.blocks) {
    const def = editorBlocks.find(b => b.id === planned.id)
    if (!def) continue
    const doc = parser.parseFromString(`<div id="root">${def.content}</div>`, 'text/html')
    const root = doc.getElementById('root')!
    const f = planned.fields

    if (planned.id === 'unsubscribe') {
      const sub = root.querySelector('[data-toggle="subtitle"]')
      const custom = asList(f.subtitle)[0]
      if (sub) setText(sub, custom && /\{\{\s*UNSUBSCRIBE_URL\s*\}\}/i.test(custom) ? custom : unsubscribeHtml(lang, address, custom?.replace(/\{\{\s*COMPANY_ADDRESS\s*\}\}/gi, '').trim()))
      blocksHtml += root.innerHTML
      continue
    }

    for (const key of ['badge', 'title', 'subtitle', 'price', 'code', 'ps'] as const) {
      const values = asList(f[key])
      if (!values.length) continue
      root.querySelectorAll(`[data-toggle="${key}"]`).forEach((el, i) => {
        const v = values[i] ?? values[0]
        if (v) setText(el, v)
      })
    }

    const buttons = asList(f.button)
    const urls = asList(f.buttonUrl)
    root.querySelectorAll('[data-toggle="button"]').forEach((el, i) => {
      const text = buttons[i] ?? buttons[0]
      if (text) {
        const span = el.querySelector('.btn-text')
        if (span) span.innerHTML = text
        else el.innerHTML = text
      }
      const url = urls[i] ?? urls[0]
      if (url) {
        const a = el.tagName === 'A' ? el : el.querySelector('a')
        a?.setAttribute('href', safeHref(url))
      }
    })

    const contacts = asList(f.contact)
    root.querySelectorAll('[data-toggle="contact"]').forEach((el, i) => {
      const value = contacts[i]
      if (!value) { el.remove(); return }
      const a = el.tagName === 'A' ? el : el.querySelector('a')
      const target = a ?? el
      target.innerHTML = value
      if (a) {
        const v = value.trim()
        if (v.includes('@') && !v.includes(' ')) a.setAttribute('href', `mailto:${v}`)
        else if (/^\+?[\d][\d\s().-]*$/.test(v)) a.setAttribute('href', `tel:${v.replace(/[^+\d]/g, '')}`)
        else a.setAttribute('href', safeHref(v.split(/\s+/)[0]))
      }
    })

    // Logo: brand logo, else explicit value, else drop the placeholder
    const logoEls = root.querySelectorAll('[data-toggle="logo"]')
    if (logoEls.length) {
      const logo = asList(f.logo)[0] || opts.brand?.logoUrl || ''
      const resolved = logo && opts.resolveImage ? await opts.resolveImage(logo) : logo || null
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
      const ref = imageRefs[i] ?? (imageEls.length === 1 ? imageRefs[0] : undefined)
      let resolved: string | null = null
      if (ref) {
        opts.onProgress?.('image')
        resolved = opts.resolveImage ? await opts.resolveImage(ref) : /^https?:\/\//.test(ref) ? ref : null
      }
      const img = el.tagName === 'IMG' ? el : el.querySelector('img')
      if (resolved && img) {
        img.setAttribute('src', resolved)
        const titles = asList(f.title)
        img.setAttribute('alt', (titles[i] ?? titles[0] ?? '').replace(/<[^>]+>/g, '').slice(0, 120))
      } else if (img && /placehold\.co/.test(img.getAttribute('src') || '')) {
        el.remove()
      }
    }

    // A pure image block with no image is dropped entirely
    if (planned.id === 'image' && !root.querySelector('img')) continue
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
  applyStyleToDocument(full, opts.styleId, opts.brand)
  return `<!DOCTYPE html>\n${full.documentElement.outerHTML}`
}

/** Image reference → URL: asset:N from the given list, a URL, or an AI prompt. */
export function imageRefToUrl(ref: string, assets: string[], allowGenerated: boolean): string | null {
  const m = ref.match(/^asset:(\d+)$/)
  if (m) return assets[Number(m[1])] ?? null
  if (/^https?:\/\//i.test(ref)) return ref
  if (!allowGenerated || ref.trim().length < 8) return null
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(ref.trim().slice(0, 400))}?width=1200&height=800&nologo=true`
}
