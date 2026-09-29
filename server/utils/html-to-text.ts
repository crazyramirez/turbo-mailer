// Minimal HTML → plain-text converter for email multipart/alternative parts.
// Multipart emails with a text part score significantly better with spam filters
// than HTML-only messages.

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&[a-z]+;/gi, m => ENTITIES[m.toLowerCase()] ?? m)
}

const ALT_OPEN = '\u0001'
const ALT_CLOSE = '\u0002'
const ALT_MARKS = /[\u0001\u0002]/g
const ALT_SPAN = /\u0001([^\u0001\u0002]*)\u0002/g

const normalized =(s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function dropRepeatedAlt(text: string): string {
  if (!text.includes(ALT_OPEN)) return text
  const visible = normalized(text.replace(ALT_SPAN, ' '))
  return text.replace(ALT_SPAN, (_m, alt: string) => (visible.includes(normalized(alt)) ? '' : alt)).replace(ALT_MARKS, '')
}

/**
 * Converts email HTML to readable plain text.
 * Links become "text (url)", block elements become line breaks,
 * tracking pixels and hidden elements are dropped, and image alt text that
 * only repeats visible text is not written twice.
 */
export function htmlToText(html: string): string {
  if (!html) return ''

  let text = html
    // Drop non-content blocks entirely
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Images: keep alt text if meaningful, drop tracking pixels. Alt text is
    // marked so it can be dropped below when the same words are already
    // visible (a card image whose alt repeats the card title).
    .replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi, `${ALT_OPEN}$1${ALT_CLOSE}`)
    .replace(/<img[^>]*>/gi, '')
    // Links: "label (url)" — skip when label already is the url
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      // An image link keeps its alt: it is the only label the link has
      const cleanLabel = label.replace(/<[^>]+>/g, '').replace(ALT_MARKS, '').replace(/\s+/g, ' ').trim()
      if (!cleanLabel) return ''
      if (!/^https?:\/\//i.test(href)) return cleanLabel
      return cleanLabel === href ? href : `${cleanLabel} (${href})`
    })
    // Line breaks for block-level boundaries
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|h[1-6]|li|blockquote|section|article|header|footer)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')

  text = dropRepeatedAlt(decodeEntities(text))

  // Normalize whitespace: collapse spaces, max one blank line
  return text
    .split('\n')
    .map(l => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
