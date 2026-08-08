import { sanitizeLinkUrl } from '~/utils/editorLinks'

// Tags an email client renders reliably. Anything else is unwrapped so its
// text survives while its markup does not.
const KEEP_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'DIV', 'SPAN',
  'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE',
])

// Inline styles worth keeping from a paste. Colors, fonts and sizes are
// deliberately dropped so pasted content adopts the template's own theme.
const KEEP_STYLES = ['font-weight', 'font-style', 'text-decoration', 'text-align']

/**
 * Turns clipboard HTML into markup safe to insert into a template block.
 *
 * Pasting from Word/Google Docs/web pages drags in <style> blocks, class soup,
 * mso-* attributes and sometimes scripts. This strips all of it, keeping only
 * structure, basic inline emphasis and safe links.
 *
 * `doc` is the document used to build the scratch tree — in the editor that is
 * the iframe's document, so nothing is parsed in the parent context.
 */
export function sanitizePastedHtml(html: string, doc: Document): string {
  const scratch = doc.createElement('div')
  scratch.innerHTML = html

  scratch.querySelectorAll('script, style, meta, link, title').forEach((n) => n.remove())
  // Word emits <o:p> and friends; querySelectorAll needs the escaped form.
  scratch.querySelectorAll('o\\:p').forEach((n) => n.remove())

  // Snapshot first: the tree is mutated while iterating.
  Array.from(scratch.querySelectorAll('*')).forEach((node) => {
    const el = node as HTMLElement

    if (!KEEP_TAGS.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes))
      return
    }

    const preserved = KEEP_STYLES.map((prop) => {
      const v = el.style?.getPropertyValue(prop)
      return v ? `${prop}:${v}` : ''
    })
      .filter(Boolean)
      .join(';')

    const href = el.tagName === 'A' ? el.getAttribute('href') : null

    // Strip every attribute, then restore only what is known-safe.
    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name))

    if (preserved) el.setAttribute('style', preserved)
    if (href) {
      const safeHref = sanitizeLinkUrl(href)
      if (safeHref) {
        el.setAttribute('href', safeHref)
        el.setAttribute('target', '_blank')
      }
    }
  })

  return scratch.innerHTML
}

/** Converts plain-text clipboard content into email-safe markup. */
export function plainTextToHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '<br>')
}
