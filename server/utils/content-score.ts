import { htmlToText } from '~/server/utils/html-to-text'

// Content risk analysis in the spirit of SpamAssassin/rspamd: many weak,
// weighted signals add up to a score instead of one word flagging a mail as
// "spam". A single "gratis" or "urgente" in a normal newsletter scores almost
// nothing — which is how real filters behave — so the check doesn't cry wolf.
//
// Score scale mirrors SpamAssassin: < 2 good, 2–5 review, ≥ 5 risky.

export interface ContentFinding {
  id: string
  weight: number
  data?: Record<string, string | number>
}

export interface ContentScore {
  score: number
  level: 'good' | 'review' | 'risky'
  findings: ContentFinding[]
  stats: { textChars: number; images: number; links: number; linkDomains: number; sizeKb: number }
}

// Strong phrases only — generic marketing words ("oferta", "gratis") alone
// are normal and scored very low.
const STRONG_PHRASES: [RegExp, number][] = [
  [/\b100\s*%\s*(gratis|free)\b/i, 0.8],
  [/\b(gane|gana|earn)\s+(dinero|money|\$|€)/i, 1.2],
  [/\bdinero f[aá]cil\b|\beasy money\b/i, 1.2],
  [/\bwork from home\b|\btrabaja desde casa y gana\b/i, 1.0],
  [/\b(viagra|cialis|casino|crypto giveaway|lottery|loter[ií]a)\b/i, 2.0],
  [/\b(act now|act immediately|act fast|compre ya|actúe ya)\b/i, 0.6],
  [/\bno (credit )?card required\b|\bsin tarjeta\b/i, 0.2],
  [/\b(you('ve| have) (won|been selected)|has (sido seleccionado|ganado))\b/i, 1.5],
  [/\b(dear (friend|customer|user)|estimado cliente)\b/i, 0.4],
  [/\b(no obligation|sin compromiso|risk[- ]free|sin riesgo)\b/i, 0.3],
  [/\b(click here|haga clic aqu[ií]|haz clic aqu[ií]|pincha aqu[ií])\b/i, 0.3],
  [/\bverify your (account|password)|verifica tu (cuenta|contraseña)\b/i, 2.0],
]

const SHORTENERS = /\/\/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc)\//i
const IP_URL = /\/\/(\d{1,3}\.){3}\d{1,3}(?::\d+)?(\/|$)/

function hostOf(url: string): string | null {
  try { return new URL(url.replace(/&amp;/g, '&')).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}

export function analyzeContent(input: { subject: string; html: string; preheader?: string | null }): ContentScore {
  const findings: ContentFinding[] = []
  const add = (id: string, weight: number, data?: ContentFinding['data']) => findings.push({ id, weight: Math.round(weight * 10) / 10, data })

  const subject = input.subject || ''
  const html = input.html || ''
  const text = htmlToText(html).replace(/\{\{[^}]+\}\}/g, 'x')
  const textChars = text.replace(/\s+/g, '').length
  const sizeKb = Math.round(Buffer.byteLength(html, 'utf-8') / 1024)

  // ── Subject ────────────────────────────────────────────────────────────
  const letters = subject.replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ]/g, '')
  const caps = subject.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '')
  if (letters.length >= 10 && caps.length / letters.length > 0.6) add('subject_caps', 1.5)
  if (/!{2,}|\?{3,}/.test(subject)) add('subject_punctuation', 0.8)
  if (/[$€£]{2,}|\${1}\d{3,}/.test(subject)) add('subject_money', 0.8)
  if (/^\s*(re|fw|fwd|rv)\s*:/i.test(subject)) add('subject_fake_reply', 1.5)
  const emojis = subject.match(/\p{Extended_Pictographic}/gu)?.length ?? 0
  if (emojis > 2) add('subject_emojis', 0.4 * (emojis - 2), { count: emojis })
  if (subject.length > 0 && subject.trim().length < 4) add('subject_too_short', 0.5)

  // ── Phrases (subject counts double: filters weigh it more) ────────────
  const hay = `${subject} ${subject} ${text}`.slice(0, 20_000)
  for (const [re, w] of STRONG_PHRASES) {
    const m = hay.match(re)
    if (m) add('phrase', w, { phrase: m[0].trim().slice(0, 40) })
  }

  // ── Structure ──────────────────────────────────────────────────────────
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0])
  // Tracking pixel and spacer images don't count
  const contentImgs = imgs.filter(tag => !/width=["']?1["']?\s|height=["']?1["']?[\s>/]/i.test(tag))
  if (contentImgs.length > 0 && textChars < 200) add('image_heavy', textChars < 50 ? 2.5 : 1.5, { images: contentImgs.length, chars: textChars })
  else if (contentImgs.length >= 6 && textChars / contentImgs.length < 60) add('image_ratio', 0.8)
  const noAlt = contentImgs.filter(tag => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length
  if (noAlt > 0) add('images_no_alt', Math.min(1, 0.2 * noAlt), { count: noAlt })
  if (textChars < 30 && contentImgs.length === 0) add('too_little_text', 1.0)

  // ── Links ──────────────────────────────────────────────────────────────
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  const urls = anchors.map(a => a[1]).filter(u => /^https?:\/\//i.test(u))
  const domains = new Set(urls.map(hostOf).filter(Boolean) as string[])
  if (urls.some(u => SHORTENERS.test(u))) add('url_shortener', 1.2)
  if (urls.some(u => IP_URL.test(u))) add('ip_url', 2.0)
  if (urls.length > 40) add('too_many_links', 0.8, { count: urls.length })
  // Visible text shows one domain, href goes elsewhere: classic phishing tell
  let mismatch = 0
  for (const [, href, inner] of anchors) {
    const shown = inner.replace(/<[^>]+>/g, '').trim()
    const shownHost = /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(shown) ? hostOf(shown.startsWith('http') ? shown : `https://${shown}`) : null
    const realHost = hostOf(href)
    if (shownHost && realHost && shownHost !== realHost && !realHost.endsWith(`.${shownHost}`) && !shownHost.endsWith(`.${realHost}`)) mismatch++
  }
  if (mismatch) add('link_text_mismatch', 1.5 * Math.min(mismatch, 2), { count: mismatch })
  if (urls.some(u => /^http:\/\//i.test(u))) add('insecure_links', 0.3)

  // ── Hidden / risky markup ─────────────────────────────────────────────
  // (the preheader block is the one legitimate hidden element)
  const hiddenBlocks = (html.match(/(font-size\s*:\s*0(px)?|color\s*:\s*(#fff(fff)?|white)[^"]*background(-color)?\s*:\s*(#fff(fff)?|white))/gi) ?? []).length
  if (hiddenBlocks > 1) add('hidden_text', 1.0)
  if (/<form\b/i.test(html)) add('form_in_email', 1.0)
  if (/<(script|iframe|object|embed)\b/i.test(html)) add('active_content', 3.0)
  if (sizeKb > 102) add('gmail_clipping', 0.5, { kb: sizeKb })
  if (/<img\b[^>]*src=["']data:/i.test(html)) add('inline_base64_images', 0.8)

  // ── Compliance ─────────────────────────────────────────────────────────
  if (!/\{\{\s*UNSUBSCRIBE_URL\s*\}\}/i.test(html) && !/unsubscribe|darse de baja|darte de baja/i.test(text)) add('no_unsubscribe', 2.0)
  if (!input.preheader?.trim()) add('no_preheader', 0.1)

  const score = Math.round(findings.reduce((s, f) => s + f.weight, 0) * 10) / 10
  return {
    score,
    level: score >= 5 ? 'risky' : score >= 2 ? 'review' : 'good',
    findings: findings.sort((a, b) => b.weight - a.weight),
    stats: { textChars, images: contentImgs.length, links: urls.length, linkDomains: domains.size, sizeKb },
  }
}
