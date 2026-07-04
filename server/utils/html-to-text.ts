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

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&[a-z]+;/gi, m => ENTITIES[m.toLowerCase()] ?? m)
}

/**
 * Converts email HTML to readable plain text.
 * Links become "text (url)", block elements become line breaks,
 * tracking pixels and hidden elements are dropped.
 */
export function htmlToText(html: string): string {
  if (!html) return ''

  let text = html
    // Drop non-content blocks entirely
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Images: keep alt text if meaningful, drop tracking pixels
    .replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi, '$1')
    .replace(/<img[^>]*>/gi, '')
    // Links: "label (url)" — skip when label already is the url
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
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

  text = decodeEntities(text)

  // Normalize whitespace: collapse spaces, max one blank line
  return text
    .split('\n')
    .map(l => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
