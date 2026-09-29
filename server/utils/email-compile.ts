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
//  6. CSS email clients drop is settled before it reaches them: var()/calc()
//     declarations leave <style> blocks (Gmail and Outlook discard them, now
//     every client renders the same), inline var() is resolved, transitions
//     and animations go, and each inline rgba() gets a solid colour first,
//     blended over the nearest background — Outlook keeps the solid one,
//     modern clients still apply the translucent one.

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

const MOTION_PROP = /^(?:-webkit-|-moz-)?(?:transition|animation)(?:-[a-z-]+)?$/i

/** Declarations of a style attribute; `;` inside url(...) or quotes doesn't split. */
export function splitDeclarations(style: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = []
  let depth = 0, quote = '', start = 0
  const push = (end: number) => {
    const part = style.slice(start, end)
    const i = part.indexOf(':')
    if (i > 0 && part.slice(0, i).trim()) out.push({ prop: part.slice(0, i).trim(), value: part.slice(i + 1).trim() })
  }
  for (let i = 0; i < style.length; i++) {
    const ch = style[i]
    if (quote) { if (ch === quote) quote = ''; continue }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === ';' && depth === 0) { push(i); start = i + 1 }
  }
  push(style.length)
  return out
}

type Rgb = [number, number, number]

function parseColor(v: string, base: Rgb): Rgb | null {
  const s = v.trim().toLowerCase()
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as Rgb
  }
  if (s === 'white') return [255, 255, 255]
  if (s === 'black') return [0, 0, 0]
  const fn = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/)
  if (!fn) return null
  const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4])
  const a = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1))
  return [1, 2, 3].map((i, n) => Math.round(a * Math.min(255, Number(fn[i])) + (1 - a) * base[n])) as Rgb
}

const hexOf = (c: Rgb) => '#' + c.map(n => n.toString(16).padStart(2, '0')).join('')
const COLOR_TOKEN = /#[0-9a-f]{3,6}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/gi

/** Solid background an element paints (first colour of background/background-color, or bgcolor). */
function paintedBackground(decls: { prop: string; value: string }[], bgcolor: string | undefined, parent: Rgb): Rgb | null {
  for (const d of [...decls].reverse()) {
    if (!/^background(-color)?$/i.test(d.prop) || /url\(/i.test(d.value)) continue
    if (/^transparent$/i.test(d.value)) return null
    const token = d.value.match(COLOR_TOKEN)?.[0]
    const color = token ? parseColor(token, parent) : null
    if (color) return color
  }
  return bgcolor ? parseColor(bgcolor, parent) : null
}

function cleanStyleBlockCss(css: string): string {
  return css.replace(/(?<=[{;])(\s*)(-{0,2}[a-z][\w-]*)\s*:\s*([^;{}]*)(;|(?=\}))/gi, (m, _ws, prop: string, value: string) =>
    prop.startsWith('--') || MOTION_PROP.test(prop) || /\b(?:var|calc)\(/i.test(value) ? '' : m)
}

/** Returns the rewritten declarations, or null when the style needs no change. */
function cleanInlineStyle(style: string, parentBg: Rgb): { style: string | null; bg: Rgb | null } {
  let decls = splitDeclarations(style)
  let changed = false
  const custom = new Map<string, string>()
  for (const d of decls) if (d.prop.startsWith('--')) custom.set(d.prop, d.value)
  decls = decls.flatMap((d) => {
    if (d.prop.startsWith('--') || MOTION_PROP.test(d.prop)) { changed = true; return [] }
    if (!/var\(/i.test(d.value)) return [d]
    changed = true
    let unresolved = false
    const value = d.value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/gi, (_m, name: string, fallback?: string) => {
      const resolved = custom.get(name) ?? fallback?.trim()
      if (!resolved || /var\(/i.test(resolved)) { unresolved = true; return '' }
      return resolved
    })
    return unresolved ? [] : [{ prop: d.prop, value }]
  })
  const bg = paintedBackground(decls, undefined, parentBg)
  const solid = new Set<string>()
  const guarded: typeof decls = []
  for (const d of decls) {
    const prop = d.prop.toLowerCase()
    if (/rgba\(/i.test(d.value) && !/shadow$/.test(prop) && !/gradient\(|url\(/i.test(d.value) && !solid.has(prop)) {
      const over = /^background(-color)?$/.test(prop) ? parentBg : bg ?? parentBg
      const flat = d.value.replace(/rgba\([^)]*\)/gi, token => { const c = parseColor(token, over); return c ? hexOf(c) : token })
      if (flat !== d.value) { guarded.push({ prop: d.prop, value: flat }); changed = true }
    }
    if (!/rgba\(/i.test(d.value)) solid.add(prop)
    guarded.push(d)
  }
  return { style: changed ? guarded.map(d => `${d.prop}:${d.value}`).join(';') : null, bg }
}

/** 6. var()/calc()/motion out, rgba() with a solid fallback. Idempotent. */
export function emailSafeCss(html: string): string {
  let out = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => open + cleanStyleBlockCss(css) + close)
  if (!/\sstyle=/i.test(out)) return out
  const edits: { start: number; end: number; tag: string }[] = []
  const stack: Rgb[] = []
  const source = out
  const parser = new Parser({
    onopentag(_name, attrs) {
      const parentBg = stack.at(-1) ?? [255, 255, 255]
      const attrBg = attrs.bgcolor ? parseColor(attrs.bgcolor, parentBg) : null
      if (attrs.style === undefined) {
        stack.push(attrBg ?? parentBg)
        return
      }
      const { style, bg } = cleanInlineStyle(attrs.style, parentBg)
      stack.push(bg ?? attrBg ?? parentBg)
      if (style === null) return
      const tag = source.slice(parser.startIndex, parser.endIndex + 1)
      const escaped = style.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      const rewritten = tag.replace(/(\sstyle\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i, () => ` style="${escaped}"`)
      if (rewritten !== tag) edits.push({ start: parser.startIndex, end: parser.endIndex + 1, tag: rewritten })
    },
    onclosetag() { stack.pop() },
  }, { decodeEntities: true })
  parser.end(source)
  if (!edits.length) return out
  const pieces: string[] = []
  let cursor = 0
  for (const edit of edits) {
    pieces.push(source.slice(cursor, edit.start), edit.tag)
    cursor = edit.end
  }
  pieces.push(source.slice(cursor))
  return pieces.join('')
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
  out = emailSafeCss(out)
  return out
}
