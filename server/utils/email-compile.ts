// Final pass that makes editor HTML robust in real email clients.
// Idempotent: compiling already-compiled HTML yields the same document.
//
//  1. Document shell: doctype, charset, viewport, Apple/Outlook meta, lang.
//  2. Outlook (Word engine) ignores max-width: the main container gets an
//     MSO-only fixed-width "ghost table" so the layout doesn't stretch.
//  3. Buttons: Outlook ignores padding/background on <a>. Styled link-buttons
//     become the padding-based bulletproof table button (works everywhere).
//  4. Grids with 3+ percentage columns stack on phones (media query + class).
//  5. Editor-only attributes are stripped; layout tables marked presentational.

import { Parser } from 'htmlparser2'
import { EDITOR_RESPONSIVE_CSS } from '~/utils/emailLayout'

const EDITOR_ATTRS = /\s(?:data-(?:id|toggle|type|layout|block|editable|selected|placeholder-img|custom-bg|custom-font|custom-radius|style-[a-z-]+)|spellcheck|contenteditable|draggable)(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi

const HEAD_META = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
  '<meta name="x-apple-disable-message-reformatting">',
  '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">',
  '<meta name="color-scheme" content="light">',
  '<meta name="supported-color-schemes" content="light">',
]

// Outlook needs this to render images at their real DPI
const MSO_HEAD = '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->'

const STACK_CSS = '<style data-tm="stack">@media only screen and (max-width:600px){table.tm-stack>tbody>tr>td,table.tm-stack>tr>td{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;padding-bottom:12px!important}}</style>'

/** Mirror the browser's durable layout hooks before editor metadata is removed.
 * Parsing only locates opening tags; untouched markup and MSO comments retain
 * their exact bytes, which keeps repeat compilation stable.
 */
function preserveLayoutHooks(html: string): string {
  const edits: { start: number; end: number; tag: string }[] = []
  const layouts: (string | undefined)[] = []
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const parser = new Parser({
    onopentag(name, attrs) {
      const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean))
      const original = [...classes].join(' ')
      const layout = ['grid', 'pricing', 'product', 'signature', 'metrics'].find(kind => classes.has(`${kind}-block`)) ?? layouts.at(-1)
      layouts.push(layout)
      if (Object.hasOwn(attrs, 'data-type') || classes.has('editable-block')) classes.add('email-block')
      const field = attrs['data-toggle']
      if (['title', 'subtitle', 'button', 'code'].includes(field)) classes.add(`email-${field}`)
      if (name === 'table' && layout && !Object.hasOwn(attrs, 'data-tm-btn')) {
        classes.add('email-layout-table')
        classes.add(`email-${layout}-table`)
        if (layout !== 'signature') classes.add('email-stack-table')
      }
      if ([...classes].join(' ') === original) return
      attrs.class = [...classes].join(' ')
      const attributes = Object.entries(attrs).map(([key, value]) => ` ${key}="${escape(value)}"`).join('')
      edits.push({ start: parser.startIndex, end: parser.endIndex + 1, tag: `<${name}${attributes}>` })
    },
    onclosetag() { layouts.pop() },
  }, { decodeEntities: true })
  parser.end(html)
  const pieces: string[] = []
  let cursor = 0
  for (const edit of edits) {
    pieces.push(html.slice(cursor, edit.start), edit.tag)
    cursor = edit.end
  }
  pieces.push(html.slice(cursor))
  return pieces.join('')
}

function ensureDocument(html: string): string {
  let out = html.trim()
  if (!/<html[\s>]/i.test(out)) {
    out = /<body[\s>]/i.test(out) ? `<html>${out}</html>` : `<html><head></head><body>${out}</body></html>`
  }
  if (!/<head[\s>]/i.test(out)) out = out.replace(/<html([^>]*)>/i, '<html$1><head></head>')
  if (!/<body[\s>]/i.test(out)) {
    out = out.replace(/<\/head>/i, '</head><body>').replace(/<\/html>/i, '</body></html>')
  }
  if (!/^<!doctype/i.test(out)) out = `<!DOCTYPE html>\n${out}`
  // Office namespaces so the MSO conditional XML is honoured
  if (!/xmlns:o=/i.test(out)) {
    out = out.replace(/<html([^>]*)>/i, '<html$1 xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">')
  }
  if (!/<html[^>]*\slang=/i.test(out)) out = out.replace(/<html/i, '<html lang="es"')
  return out
}

function ensureHeadMeta(html: string): string {
  const missing: string[] = []
  if (!/<meta[^>]+charset=/i.test(html)) missing.push(HEAD_META[0])
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) missing.push(HEAD_META[1])
  if (!/<meta[^>]+X-UA-Compatible/i.test(html)) missing.push(HEAD_META[2])
  if (!/x-apple-disable-message-reformatting/i.test(html)) missing.push(HEAD_META[3])
  if (!/<meta[^>]+name=["']format-detection["']/i.test(html)) missing.push(HEAD_META[4])
  if (!/<meta[^>]+name=["']color-scheme["']/i.test(html)) missing.push(HEAD_META[5], HEAD_META[6])
  if (!/o:OfficeDocumentSettings/i.test(html)) missing.push(MSO_HEAD)
  if (!missing.length) return html
  return html.replace(/<head([^>]*)>/i, `<head$1>${missing.join('')}`)
}

/** Layout tables must be announced as presentational to screen readers. */
function presentationalTables(html: string): string {
  return html.replace(/<table(?![^>]*\srole=)([^>]*)>/gi, '<table role="presentation"$1>')
}

/** Index just past the </div> that closes the <div> starting at `start`. */
export function matchingDivEnd(html: string, start: number): number {
  const re = /<\/?div\b[^>]*>/gi
  re.lastIndex = start
  let depth = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth--
      if (depth === 0) return m.index + m[0].length
    } else if (!m[0].endsWith('/>')) {
      depth++
    }
  }
  return -1
}

/** 2. MSO ghost table around the first max-width container. */
function outlookContainer(html: string): string {
  if (/data-tm="ghost"/.test(html)) return html
  const bodyOpen = html.search(/<body[^>]*>/i)
  if (bodyOpen < 0) return html
  const re = /<div\b[^>]*style=["'][^"']*max-width\s*:\s*(\d{3,4})px/gi
  re.lastIndex = bodyOpen
  const m = re.exec(html)
  if (!m) return html
  const width = Math.min(800, Math.max(320, Number(m[1])))
  const end = matchingDivEnd(html, m.index)
  if (end < 0) return html
  const open = `<!--[if mso]><table role="presentation" data-tm="ghost" align="center" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:${width}px;"><tr><td><![endif]-->`
  const close = '<!--[if mso]></td></tr></table><![endif]-->'
  return html.slice(0, m.index) + open + html.slice(m.index, end) + close + html.slice(end)
}

function styleProp(style: string, prop: string): string | null {
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))
  return m ? m[1].trim() : null
}

function toHexColor(v: string | null): string | null {
  if (!v) return null
  const s = v.trim()
  const hex = s.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)
  if (hex) return `#${hex[1]}`
  const rgb = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
  return null
}

/** 3. Styled <a> buttons → padding-based bulletproof table buttons. */
function bulletproofButtons(html: string): string {
  return html.replace(/<a\b([^>]*?)style=(?:"([^"]*)"|'([^']*)')([^>]*)>([\s\S]*?)<\/a>/gi, (match, pre, dq, sq, post, inner) => {
    const style: string = dq ?? sq ?? ''
    const q = dq !== undefined ? '"' : "'"
    if (/<a\b/i.test(inner) || /data-tm-btn/.test(pre + post)) return match
    const bgRaw = styleProp(style, 'background-color') ?? styleProp(style, 'background')
    const padding = styleProp(style, 'padding')
    const display = styleProp(style, 'display') ?? ''
    const bg = toHexColor(bgRaw)
    // Only real buttons: colored background + padding + block-ish display
    if (!bg || !padding || !/block|inline-block/i.test(display) || /url\(/i.test(bgRaw ?? '')) return match
    const radius = styleProp(style, 'border-radius') ?? '0'
    const full = /^100%\s*(?:!important)?$/i.test(styleProp(style, 'width') || '')
    const align = (styleProp(style, 'text-align') ?? 'center').replace(/[^a-z]/gi, '') || 'center'
    // The link keeps typography/colour; box styling moves to the cell
    const linkStyle = style
      .split(';')
      .map((d: string) => d.trim())
      .filter((d: string) => d && !/^(background|background-color|padding|border-radius|display|width|max-width|min-width|box-sizing|margin)\s*:/i.test(d))
      .concat(['display:inline-block', 'mso-line-height-rule:exactly'])
      .join(';')
    const table = full ? 'width="100%"' : `align="${align === 'left' || align === 'right' ? align : 'center'}"`
    return `<table role="presentation" data-tm-btn="1" ${table} cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;${full ? 'width:100%;' : ''}"><tr><td align="${align}" bgcolor="${bg}" style="background-color:${bg};border-radius:${radius};padding:${padding};mso-padding-alt:${padding};"><a${pre}style=${q}${linkStyle}${q}${post}>${inner}</a></td></tr></table>`
  })
}

/** 4. Rows with 3+ percentage-width cells stack on small screens. */
function stackableGrids(html: string): string {
  let changed = false
  const out = html.replace(/<table\b([^>]*)>((?:(?!<table\b)[\s\S])*?<tr\b[^>]*>(?:\s*<td\b[^>]*width=["']?\d{1,2}%[^>]*>[\s\S]*?<\/td>){3,})/gi, (m, attrs, rest) => {
    // Native/editor-generated grids already own their responsive rules. In
    // particular Quad keeps pairs on mobile before stacking below 360px.
    if (/\bemail-stack-table\b/.test(attrs) || /\b(?:grid-quad-td|ai-layout-half)\b/.test(rest)) return m
    if (/\btm-stack\b/.test(attrs)) return m
    changed = true
    const withClass = /\bclass=["']/.test(attrs)
      ? attrs.replace(/\bclass=(["'])/, 'class=$1tm-stack ')
      : `${attrs} class="tm-stack"`
    return `<table${withClass}>${rest}`
  })
  if (!changed && !/\btm-stack\b/.test(out)) return out
  if (/data-tm="stack"/.test(out)) return out
  return out.replace(/<\/head>/i, `${STACK_CSS}</head>`)
}

export function finalizeEmailHtml(html: string): string {
  if (!html) return html
  let out = bulletproofButtons(preserveLayoutHooks(html))
  out = out.replace(EDITOR_ATTRS, '')
  out = ensureDocument(out)
  out = ensureHeadMeta(out)
  if (/\bemail-block\b/.test(out) && !out.includes('.email-stack-table') && !/data-tm="responsive"/.test(out)) {
    out = out.replace(/<\/head>/i, `<style data-tm="responsive">${EDITOR_RESPONSIVE_CSS}</style></head>`)
  }
  out = outlookContainer(out)
  out = stackableGrids(out)
  out = presentationalTables(out)
  return out
}
