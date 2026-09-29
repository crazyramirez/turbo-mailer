// One-click repair of a stored email template: fixes what the pre-send check
// reports and a machine can fix safely, keeping the HTML editable.
//
//   duplicate_blocks  a module repeated back-to-back (same markup) is removed
//   alt_text          alt with leftover entities/markup ("Photo &amp;amp; Video")
//   unsubscribe_text  vague unsubscribe link ("haz clic aquí") → descriptive
//   webp              WebP images (Outlook Windows shows nothing) → JPEG/PNG
//   image_crop        fixed-height object-fit images are cropped to their box,
//                     so clients that ignore object-fit don't stretch them
//   image_size        width/height attributes from the layout: Outlook ignores
//                     CSS sizes and would draw a 1200px file at 1200px
//
// Edits are spliced into the original string, so untouched markup (MSO
// comments, editor attributes) keeps its exact bytes. Running it twice is a
// no-op. applyTextEdits() applies the AI review's find/replace corrections.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { parseDocument } from 'htmlparser2'
import type { AnyNode, Element, ParentNode, Text } from 'domhandler'
import { splitDeclarations } from '~/server/utils/email-compile'
import { decodeEntities } from '~/server/utils/html-to-text'
import { downloadRemoteImage, resolveUpload, saveImage } from '~/server/utils/uploads'

export type RepairId = 'duplicate_blocks' | 'alt_text' | 'unsubscribe_text' | 'webp' | 'image_crop' | 'image_size'

export interface RepairChange { id: RepairId; count: number }

export interface RepairOptions {
  /** Absolute origin that also serves /uploads (trackingBaseUrl), besides relative URLs */
  localOrigin?: string | null
  /** Image work (conversion, crops, sizes). Off → only markup fixes. */
  images?: boolean
  /** Only report what would change: no downloads, no new files, HTML untouched */
  dryRun?: boolean
}

/** Outlook draws the main container at this width (see outlookContainer in email-compile). */
const OUTLOOK_WIDTH = 800
const WIDTH_TOLERANCE = 0.15
const ASPECT_TOLERANCE = 0.03

interface Edit { start: number; end: number; text: string }

const isElement = (n: AnyNode | null | undefined): n is Element => !!n && (n.type === 'tag' || n.type === 'script' || n.type === 'style')
const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const escapeText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;')

function* walk(nodes: AnyNode[]): Generator<AnyNode> {
  for (const n of nodes) {
    yield n
    if ('children' in n && n.children?.length) yield* walk(n.children as AnyNode[])
  }
}

/** Index just past the ">" that closes the open tag starting at `start`. */
function openTagEnd(html: string, start: number): number {
  let quote = ''
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (quote) { if (ch === quote) quote = ''; continue }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '>') return i + 1
  }
  return html.length
}

function openTag(el: Element, attrs: Record<string, string>): string {
  return `<${el.name}${Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')}>`
}

function applyEdits(html: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end)
  const pieces: string[] = []
  let cursor = 0
  for (const e of sorted) {
    if (e.start < cursor) continue // nested in something already replaced (e.g. a removed duplicate)
    pieces.push(html.slice(cursor, e.start), e.text)
    cursor = e.end
  }
  pieces.push(html.slice(cursor))
  return pieces.join('')
}

function styleOf(el: Element): Map<string, string> {
  const map = new Map<string, string>()
  for (const d of splitDeclarations(el.attribs.style || '')) map.set(d.prop.toLowerCase(), d.value.replace(/\s*!important$/i, '').trim())
  return map
}

const pxOf = (v?: string | null): number | null => {
  const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)(px)?$/i)
  return m ? Number(m[1]) : null
}
const pctOf = (v?: string | null): number | null => {
  const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)%$/)
  return m ? Number(m[1]) / 100 : null
}

/** Left + right padding in px (shorthand, overridden by padding-left/right). */
function padding(style: Map<string, string>): number {
  const parts = (style.get('padding') ?? '').trim().split(/\s+/).filter(Boolean).map(p => pxOf(p) ?? 0)
  const [right, left] = parts.length === 1 ? [parts[0], parts[0]]
    : parts.length === 2 || parts.length === 3 ? [parts[1], parts[1]]
      : parts.length === 4 ? [parts[1], parts[3]] : [0, 0]
  return (pxOf(style.get('padding-left')) ?? left) + (pxOf(style.get('padding-right')) ?? right)
}

function borderWidth(style: Map<string, string>): number {
  const widthIn = (v?: string) => {
    const token = String(v ?? '').split(/\s+/).find(t => /^\d+(\.\d+)?px$/.test(t))
    return token ? pxOf(token)! : 0
  }
  if (/none|^0/.test(style.get('border') ?? '') && !style.has('border-left') && !style.has('border-right')) return 0
  const all = widthIn(style.get('border'))
  const left = style.has('border-left') ? widthIn(style.get('border-left')) : all
  const right = style.has('border-right') ? widthIn(style.get('border-right')) : all
  return left + right
}

/** Estimated content width (px) of an element when the email is drawn OUTLOOK_WIDTH wide. */
function layoutEstimator() {
  const memo = new Map<Element, number>()
  const parentElement = (el: Element): Element | null => (isElement(el.parent as AnyNode) ? el.parent as Element : null)
  const contentWidth = (el: Element): number => {
    const cached = memo.get(el)
    if (cached !== undefined) return cached
    const parent = parentElement(el)
    if (!parent || ['html', 'body'].includes(el.name)) { memo.set(el, OUTLOOK_WIDTH); return OUTLOOK_WIDTH }
    const P = contentWidth(parent)
    const style = styleOf(el)
    const declared = style.get('width') ?? el.attribs.width
    let w = P
    if (el.name === 'td' || el.name === 'th') {
      const own = pctOf(declared) !== null ? P * pctOf(declared)! : pxOf(declared)
      if (own !== null) w = own
      else {
        const cells = (parent.children as AnyNode[]).filter(isElement).filter(c => c.name === 'td' || c.name === 'th')
        let fixed = 0, free = 0
        for (const c of cells) {
          const cw = styleOf(c).get('width') ?? c.attribs.width
          const v = pctOf(cw) !== null ? P * pctOf(cw)! : pxOf(cw)
          if (v === null) free++
          else fixed += v
        }
        w = Math.max(0, (P - fixed) / Math.max(1, free))
      }
      let table: Element | null = parent
      while (table && table.name !== 'table') table = parentElement(table)
      w -= 2 * (pxOf(table?.attribs.cellpadding) ?? 0)
    } else if (declared !== undefined) {
      const pct = pctOf(declared)
      const px = pxOf(declared)
      if (pct !== null) w = P * pct
      else if (px !== null) w = px
    }
    const max = style.get('max-width')
    if (pctOf(max) !== null) w = Math.min(w, P * pctOf(max)!)
    else if (pxOf(max) !== null) w = Math.min(w, pxOf(max)!)
    const content = Math.max(0, Math.min(w, P) - padding(style) - borderWidth(style))
    memo.set(el, content)
    return content
  }
  return contentWidth
}

// ── Text fixes ───────────────────────────────────────────────────────────

const VAGUE_UNSUB = /^(?:(?:haz|pulsa|clica|click|clic)\s+)?(?:clic\s+|click\s+)?aqu[ií](?:\s+para\s+dar(?:te|se)\s+de\s+baja)?\.?$|^(?:click|tap)\s+here(?:\s+to\s+unsubscribe)?\.?$|^here$/i

function textOf(node: AnyNode): string {
  if (node.type === 'text') return (node as Text).data
  return 'children' in node ? (node.children as AnyNode[]).map(textOf).join('') : ''
}

// ── Main ─────────────────────────────────────────────────────────────────

export async function repairEmailHtml(html: string, opts: RepairOptions = {}): Promise<{ html: string; changes: RepairChange[] }> {
  if (!html?.trim()) return { html, changes: [] }
  const doc = parseDocument(html, { withStartIndices: true, withEndIndices: true, decodeEntities: true })
  const edits: Edit[] = []
  const counts = new Map<RepairId, number>()
  const bump = (id: RepairId) => counts.set(id, (counts.get(id) ?? 0) + 1)
  const elements = [...walk(doc.children as AnyNode[])].filter(isElement)
  const langEn = /^en\b/i.test(elements.find(e => e.name === 'html')?.attribs.lang ?? '')
  // Attribute changes per element, merged into one rewritten open tag at the end
  const attrChanges = new Map<Element, Record<string, string>>()
  const setAttr = (el: Element, key: string, value: string) => {
    attrChanges.set(el, { ...(attrChanges.get(el) ?? {}), [key]: value })
  }

  // 1. Back-to-back duplicate modules
  const removed = new Set<Element>()
  const markup = (a: Element) => html.slice(a.startIndex!, a.endIndex! + 1).replace(/\s+/g, ' ').trim()
  for (const el of elements) {
    const isBlock = /\b(editable-block|email-block)\b/.test(el.attribs.class || '') || el.attribs['data-type'] !== undefined
    if (!isBlock || /spacer|divider/i.test(`${el.attribs.class} ${el.attribs['data-type']}`)) continue
    let prev = el.prev as AnyNode | null
    while (prev && prev.type === 'text' && !(prev as Text).data.trim()) prev = prev.prev as AnyNode | null
    if (!isElement(prev)) continue
    if (textOf(el).trim() && markup(prev) === markup(el)) {
      removed.add(el)
      edits.push({ start: el.startIndex!, end: el.endIndex! + 1, text: '' })
      bump('duplicate_blocks')
    }
  }
  const alive = (el: Element) => {
    for (let n: AnyNode | null = el; n; n = n.parent as AnyNode | null) if (isElement(n) && removed.has(n)) return false
    return true
  }

  // 2. Alt text with leftover entities or markup
  for (const img of elements.filter(e => e.name === 'img' && e.attribs.alt && alive(e))) {
    const alt = img.attribs.alt
    let clean = alt
    for (let i = 0; i < 2 && /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(clean); i++) clean = decodeEntities(clean)
    clean = clean.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    if (clean !== alt) { setAttr(img, 'alt', clean); bump('alt_text') }
  }

  // 3. "haz clic aquí" unsubscribe links → the action itself as link text
  for (const a of elements.filter(e => e.name === 'a' && /^\{\{\s*UNSUBSCRIBE_URL\s*\}\}$/.test(e.attribs.href || '') && alive(e))) {
    const label = textOf(a).replace(/\s+/g, ' ').trim()
    if (!VAGUE_UNSUB.test(label) || a.children.some(c => isElement(c as AnyNode) && (c as Element).name === 'img')) continue
    const first = a.children[0] as AnyNode, last = a.children[a.children.length - 1] as AnyNode
    edits.push({ start: first.startIndex!, end: last.endIndex! + 1, text: langEn ? 'unsubscribe from this list' : 'darte de baja de esta lista' })
    // "…comunicaciones, <a>" → "…comunicaciones, puedes <a>" so the sentence still reads
    const before = a.prev as AnyNode | null
    if (before?.type === 'text' && /,\s*$/.test((before as Text).data)) {
      const raw = html.slice(before.startIndex!, before.endIndex! + 1)
      edits.push({ start: before.startIndex!, end: before.endIndex! + 1, text: raw.replace(/,\s*$/, langEn ? ', you can ' : ', puedes ') })
    }
    bump('unsubscribe_text')
  }

  // 4. Images: WebP → JPEG/PNG, crop fixed boxes, width/height for Outlook
  if (opts.images !== false) {
    const contentWidth = layoutEstimator()
    const localName = (src: string): string | null => {
      const origin = opts.localOrigin?.replace(/\/+$/, '')
      const rel = origin && src.startsWith(`${origin}/`) ? src.slice(origin.length) : src
      const m = rel.match(/^\/uploads\/([^?#]+)/)
      if (!m) return null
      try { return decodeURIComponent(m[1]) } catch { return null }
    }
    for (const img of elements.filter(e => e.name === 'img' && e.attribs.src && alive(e))) {
      const parent = img.parent as AnyNode
      if (!isElement(parent)) continue
      let src = img.attribs.src
      if (/\{\{|^data:/i.test(src)) continue
      let file: { buffer: Buffer; meta: sharp.Metadata } | null = null
      const load = async (): Promise<typeof file> => {
        if (file) return file
        const name = localName(src)
        const local = name ? resolveUpload(name) : null
        try {
          const buffer = local ? await fs.readFile(local) : /^https?:\/\//i.test(src) && !opts.dryRun ? await downloadRemoteImage(src) : null
          if (!buffer) return null
          file = { buffer, meta: await sharp(buffer).metadata() }
        } catch { file = null }
        return file
      }
      // Drop our own "mail_1700000000000-" prefixes so repeated repairs don't grow the name
      const stem = path.basename(localName(src) ?? src.split(/[?#]/)[0].split('/').pop() ?? 'imagen')
        .replace(/\.[a-z0-9]+$/i, '').replace(/^(?:(?:mail|ai)_)?\d{10,}-/, '') || 'imagen'

      if (/\.webp(?:[?#]|$)/i.test(src) || (localName(src) && (await load())?.meta.format === 'webp')) {
        const f = await load()
        if (opts.dryRun) bump('webp')
        else if (f) {
          try {
            const saved = await saveImage(f.buffer, `${stem}.webp`, 'mail_')
            src = saved.url
            setAttr(img, 'src', src)
            file = null
            bump('webp')
          } catch {}
        }
      }

      const style = styleOf(img)
      const box = contentWidth(parent)
      const cssW = style.get('width')
      const fixedH = pxOf(style.get('height'))
      const cover = /cover/i.test(style.get('object-fit') ?? '')
      let width: number | null = null
      let height: number | null = null
      if (pctOf(cssW) !== null) width = box * pctOf(cssW)!
      else if (pxOf(cssW) !== null) width = Math.min(pxOf(cssW)!, box)
      if (fixedH !== null) height = fixedH

      if (width !== null && height !== null && cover && !/\.gif(?:[?#]|$)/i.test(src)) {
        const f = await load()
        const natW = f?.meta.width, natH = f?.meta.height
        if (f && natW && natH && f.meta.format !== 'gif') {
          const target = width / height
          if (Math.abs(natW / natH - target) / target > ASPECT_TOLERANCE && opts.dryRun) bump('image_crop')
          else if (Math.abs(natW / natH - target) / target > ASPECT_TOLERANCE) {
            try {
              const outW = Math.min(natW, Math.round(width * 2), Math.round(natH * target))
              const outH = Math.round(outW / target)
              const cropped = await sharp(f.buffer).rotate().resize(outW, outH, { fit: 'cover', position: 'centre' })
                .toFormat(f.meta.format === 'png' ? 'png' : 'jpeg').toBuffer()
              const saved = await saveImage(cropped, `${stem}-${Math.round(width)}x${Math.round(height)}.${f.meta.format === 'png' ? 'png' : 'jpg'}`, 'mail_')
              setAttr(img, 'src', saved.url)
              bump('image_crop')
            } catch {}
          }
        }
      } else if (width === null) {
        // Natural size (logos: width:auto + max-height) — needs the file
        const f = localName(src) ? await load() : null
        const natW = f?.meta.width, natH = f?.meta.height
        if (natW && natH) {
          const maxH = pxOf(style.get('max-height'))
          let w = natW, h = natH
          if (height !== null) { w = natW * height / natH; h = height }
          else if (maxH !== null && h > maxH) { w = natW * maxH / natH; h = maxH }
          if (w > box) { h = h * box / w; w = box }
          width = w
          height = h
        }
      }

      if (width === null || width < 1) continue
      const current = pxOf(img.attribs.width)
      if (current === null || Math.abs(current - width) / width > WIDTH_TOLERANCE) {
        setAttr(img, 'width', String(Math.round(width)))
        if (height !== null) setAttr(img, 'height', String(Math.round(height)))
        bump('image_size')
      } else if (height !== null && pxOf(img.attribs.height) === null) {
        setAttr(img, 'height', String(Math.round(height)))
        bump('image_size')
      }
    }
  }

  for (const [el, changes] of attrChanges) {
    const end = openTagEnd(html, el.startIndex!)
    edits.push({ start: el.startIndex!, end, text: openTag(el, { ...el.attribs, ...changes }) })
  }
  const changes = [...counts].map(([id, count]) => ({ id, count }))
  if (opts.dryRun || !edits.length) return { html, changes: opts.dryRun ? changes : [] }
  return { html: applyEdits(html, edits), changes }
}

// ── AI review corrections ────────────────────────────────────────────────

export type EditTarget = 'subject' | 'subjectB' | 'preheader' | 'body'

export interface TextEdit {
  target: EditTarget
  find: string
  replace: string
  /** 1-based: only the Nth match; 0 or absent: every match */
  occurrence?: number
}

/** `find` as a regex that tolerates any run of whitespace (HTML wraps text freely). */
function findPattern(find: string): RegExp | null {
  const words = find.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  return new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g')
}

export function replaceInText(text: string, edit: Pick<TextEdit, 'find' | 'replace' | 'occurrence'>): { text: string; hits: number } {
  const re = findPattern(edit.find)
  if (!re || !text) return { text, hits: 0 }
  const want = Math.max(0, Math.floor(edit.occurrence ?? 0))
  let seen = 0, hits = 0
  const out = text.replace(re, (m) => {
    seen++
    if (want && seen !== want) return m
    hits++
    return edit.replace
  })
  return { text: out, hits }
}

/**
 * Applies find/replace to the visible text of an email (text nodes only: tags,
 * attributes and links stay intact). `occurrence` counts across the whole
 * document. Text inside the hidden preheader is only touched when `preheader`.
 */
export function replaceInHtml(html: string, edit: TextEdit): { html: string; hits: number } {
  const re = findPattern(edit.find)
  if (!re || !html) return { html, hits: 0 }
  const doc = parseDocument(html, { withStartIndices: true, withEndIndices: true, decodeEntities: true })
  const inPreheader = (n: AnyNode) => {
    for (let p = n.parent as ParentNode | null; p; p = p.parent as ParentNode | null) {
      if (isElement(p as AnyNode) && (p as Element).attribs['data-email-preheader'] !== undefined) return true
    }
    return false
  }
  const want = Math.max(0, Math.floor(edit.occurrence ?? 0))
  let seen = 0, hits = 0
  const edits: Edit[] = []
  for (const node of walk(doc.children as AnyNode[])) {
    if (node.type !== 'text') continue
    const parent = node.parent as AnyNode | null
    if (isElement(parent) && ['style', 'script', 'title'].includes(parent.name)) continue
    if ((edit.target === 'preheader') !== inPreheader(node)) continue
    const data = (node as Text).data
    let changed = false
    const next = data.replace(re, (m) => {
      seen++
      if (want && seen !== want) return m
      hits++
      changed = true
      return edit.replace
    })
    if (changed) edits.push({ start: node.startIndex!, end: node.endIndex! + 1, text: escapeText(next) })
  }
  return { html: edits.length ? applyEdits(html, edits) : html, hits }
}
