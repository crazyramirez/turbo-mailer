import { sqlite } from '~/server/db/index'
import { safeFetch } from '~/server/utils/safe-fetch'
import { htmlToText } from '~/server/utils/html-to-text'
import { aiJson, aiConfigured } from '~/server/utils/ai/provider'

// Brand kit: the identity every AI generation follows (colors, fonts, logo,
// voice, audience, legal footer). Can be extracted from the brand's website.

export interface BrandKit {
  name: string
  website: string
  logoUrl: string
  tagline: string
  colors: { primary: string; secondary: string; background: string; text: string }
  fonts: { heading: string; body: string }
  voice: string
  audience: string
  valueProps: string[]
  products: string[]
  doNotSay: string[]
  footer: string
  language: string
  updatedAt?: string
}

export const EMPTY_BRAND_KIT: BrandKit = {
  name: '', website: '', logoUrl: '', tagline: '',
  colors: { primary: '#6366f1', secondary: '#0f172a', background: '#ffffff', text: '#0f172a' },
  fonts: { heading: 'Arial, Helvetica, sans-serif', body: 'Arial, Helvetica, sans-serif' },
  voice: '', audience: '', valueProps: [], products: [], doNotSay: [], footer: '', language: 'es',
}

const KEY = 'brand_kit'

export function getBrandKit(): BrandKit {
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined
  if (!row) return { ...EMPTY_BRAND_KIT }
  try {
    const parsed = JSON.parse(row.value)
    return { ...EMPTY_BRAND_KIT, ...parsed, colors: { ...EMPTY_BRAND_KIT.colors, ...parsed.colors }, fonts: { ...EMPTY_BRAND_KIT.fonts, ...parsed.fonts } }
  } catch {
    return { ...EMPTY_BRAND_KIT }
  }
}

const HEX = /^#[0-9a-f]{6}$/i
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const list = (v: unknown, max: number, itemMax: number) => (Array.isArray(v) ? v : []).map(x => str(x, itemMax)).filter(Boolean).slice(0, max)

export function sanitizeBrandKit(input: any): BrandKit {
  const color = (v: unknown, fb: string) => (HEX.test(String(v ?? '')) ? String(v).toLowerCase() : fb)
  const website = str(input?.website, 300)
  const logo = str(input?.logoUrl, 500)
  return {
    name: str(input?.name, 120),
    website: /^https?:\/\//i.test(website) ? website : '',
    logoUrl: /^(https?:\/\/|\/uploads\/)/i.test(logo) ? logo : '',
    tagline: str(input?.tagline, 200),
    colors: {
      primary: color(input?.colors?.primary, EMPTY_BRAND_KIT.colors.primary),
      secondary: color(input?.colors?.secondary, EMPTY_BRAND_KIT.colors.secondary),
      background: color(input?.colors?.background, EMPTY_BRAND_KIT.colors.background),
      text: color(input?.colors?.text, EMPTY_BRAND_KIT.colors.text),
    },
    fonts: {
      heading: str(input?.fonts?.heading, 120).replace(/[;{}<>]/g, '') || EMPTY_BRAND_KIT.fonts.heading,
      body: str(input?.fonts?.body, 120).replace(/[;{}<>]/g, '') || EMPTY_BRAND_KIT.fonts.body,
    },
    voice: str(input?.voice, 1000),
    audience: str(input?.audience, 1000),
    valueProps: list(input?.valueProps, 10, 200),
    products: list(input?.products, 20, 200),
    doNotSay: list(input?.doNotSay, 20, 120),
    footer: str(input?.footer, 1000),
    language: ['es', 'en', 'pt', 'fr', 'de', 'it', 'ca'].includes(input?.language) ? input.language : 'es',
  }
}

export function saveBrandKit(kit: BrandKit): BrandKit {
  const value = { ...kit, updatedAt: new Date().toISOString() }
  sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(KEY, JSON.stringify(value), Math.floor(Date.now() / 1000))
  return value
}

/** Short brief of the brand for AI prompts (empty when no kit is set). */
export function brandBrief(kit = getBrandKit()): string {
  if (!kit.name && !kit.voice && !kit.valueProps.length) return ''
  return [
    `MARCA: ${kit.name}${kit.tagline ? ` — ${kit.tagline}` : ''}`,
    kit.website && `Web: ${kit.website}`,
    kit.voice && `Tono de voz: ${kit.voice}`,
    kit.audience && `Público: ${kit.audience}`,
    kit.valueProps.length && `Propuestas de valor: ${kit.valueProps.join(' · ')}`,
    kit.products.length && `Productos/servicios: ${kit.products.join(' · ')}`,
    kit.doNotSay.length && `Nunca digas: ${kit.doNotSay.join(' · ')}`,
    `Colores: principal ${kit.colors.primary}, secundario ${kit.colors.secondary}`,
  ].filter(Boolean).join('\n')
}

// ── Extraction from a website ────────────────────────────────────────────────

function metaContent(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  return tag?.match(/content=["']([^"']+)["']/i)?.[1] ?? null
}

function absolute(u: string | null | undefined, base: string): string {
  if (!u) return ''
  try { return new URL(u, base).href } catch { return '' }
}

function topColors(css: string): string[] {
  const counts = new Map<string, number>()
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let hex = m[1].toLowerCase()
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    // Skip greys/near-white/near-black: they're not brand colors
    if (max - min < 30 || max < 40 || min > 225) continue
    counts.set(`#${hex}`, (counts.get(`#${hex}`) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

export async function extractBrandFromUrl(url: string): Promise<{ kit: BrandKit; source: { title: string; images: string[] } }> {
  const page = await safeFetch(url, { maxBytes: 3 * 1024 * 1024 })
  if (page.status >= 400) throw createError({ statusCode: 422, statusMessage: `La web respondió ${page.status}` })
  const html = page.body.toString('utf-8')
  const base = page.url

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
  const description = metaContent(html, 'name', 'description') ?? metaContent(html, 'property', 'og:description') ?? ''
  const siteName = metaContent(html, 'property', 'og:site_name') ?? title.split(/[|–—-]/)[0]?.trim() ?? ''
  const ogImage = absolute(metaContent(html, 'property', 'og:image'), base)
  const themeColor = metaContent(html, 'name', 'theme-color')

  // Logo: an <img> that says "logo", else the apple-touch-icon
  const logoImg = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]).find(t => /logo/i.test(t))
  const logoSrc = logoImg?.match(/\ssrc=["']([^"']+)["']/i)?.[1]
  const touchIcon = html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1]
  const logoUrl = absolute(logoSrc, base) || absolute(touchIcon, base)

  // Colors from inline <style> plus up to two same-site stylesheets
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n')
  css += [...html.matchAll(/style=["']([^"']+)["']/gi)].map(m => m[1]).join(';')
  const sheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map(m => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean)
    .map(h => absolute(h!, base)).filter(h => { try { return new URL(h).host === new URL(base).host } catch { return false } })
    .slice(0, 2)
  for (const s of sheets) {
    try { css += '\n' + (await safeFetch(s, { maxBytes: 600_000, accept: 'text/css,*/*' })).body.toString('utf-8') } catch {}
  }
  const colors = topColors(`${themeColor ?? ''} ${css}`)

  // Fonts: Google Fonts families or the first font-family declarations
  const gf = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi)].map(m => decodeURIComponent(m[1]).split(':')[0].replace(/\+/g, ' '))
  const declared = [...css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)].map(m => m[1].split(',')[0].replace(/["']/g, '').trim())
    .filter(f => !/inherit|initial|var\(|system-ui|-apple-system|sans-serif|serif|monospace|icon|fontawesome/i.test(f))
  const font = gf[0] || declared[0] || ''

  const images = [...new Set([ogImage, ...[...html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)].map(m => absolute(m[1], base))])]
    .filter(u => /^https?:\/\//.test(u) && !/\.svg(\?|$)/i.test(u) && !/logo|icon|sprite|pixel|avatar/i.test(u)).slice(0, 8)

  const kit: BrandKit = {
    ...EMPTY_BRAND_KIT,
    name: siteName.slice(0, 120),
    website: base,
    logoUrl,
    tagline: description.slice(0, 200),
    colors: {
      primary: colors[0] ?? EMPTY_BRAND_KIT.colors.primary,
      secondary: colors[1] ?? EMPTY_BRAND_KIT.colors.secondary,
      background: '#ffffff',
      text: '#0f172a',
    },
    fonts: font ? { heading: `${font}, Arial, sans-serif`, body: `${font}, Arial, sans-serif` } : EMPTY_BRAND_KIT.fonts,
    language: (html.match(/<html[^>]*\slang=["']([a-z]{2})/i)?.[1] ?? 'es').toLowerCase(),
  }

  // Voice, audience and offer from the page copy
  if (aiConfigured()) {
    const text = htmlToText(html).replace(/\s+/g, ' ').slice(0, 8000)
    const ai = await aiJson<{ name: string; tagline: string; voice: string; audience: string; valueProps: string[]; products: string[]; doNotSay: string[] }>({
      feature: 'brand_extract',
      effort: 'medium',
      maxTokens: 4000,
      system: 'Eres estratega de marca. Analizas el texto de la web de una empresa y describes su identidad verbal de forma concreta y útil para escribir emails de marketing en su nombre. No inventes datos que no estén en el texto.',
      messages: [{ role: 'user', content: `Web: ${base}\nTítulo: ${title}\nDescripción: ${description}\n\nTexto visible:\n${text}\n\nDevuelve: nombre de la marca, tagline corto, tono de voz (3-5 rasgos concretos con ejemplos de cómo habla), público objetivo, 3-6 propuestas de valor, productos/servicios principales, y expresiones a evitar. Escribe en el idioma de la web.` }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'tagline', 'voice', 'audience', 'valueProps', 'products', 'doNotSay'],
        properties: {
          name: { type: 'string' },
          tagline: { type: 'string' },
          voice: { type: 'string' },
          audience: { type: 'string' },
          valueProps: { type: 'array', items: { type: 'string' } },
          products: { type: 'array', items: { type: 'string' } },
          doNotSay: { type: 'array', items: { type: 'string' } },
        },
      },
    })
    Object.assign(kit, {
      name: ai.name || kit.name,
      tagline: ai.tagline || kit.tagline,
      voice: ai.voice,
      audience: ai.audience,
      valueProps: ai.valueProps,
      products: ai.products,
      doNotSay: ai.doNotSay,
    })
  }

  return { kit: sanitizeBrandKit(kit), source: { title, images } }
}
