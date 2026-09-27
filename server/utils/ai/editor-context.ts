import { open, opendir, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { Parser } from 'htmlparser2'
import { sqlite } from '~/server/db/index'
import { getBrandKit, sanitizeBrandKit, type BrandKit } from '~/server/utils/ai/brand-kit'
import { sanitizeTemplateName, templatesDir } from '~/server/utils/template-files'
import { emptyAssistantSignature, type AssistantSignature, type AssistantSignatureCandidate } from '~/utils/editorAssistant'

export type SignatureData = AssistantSignature
export type SignatureCandidate = AssistantSignatureCandidate

const MAX_HTML_BYTES = 1024 * 1024
const MAX_CAMPAIGNS = 20
const MAX_TEMPLATE_READS = 20
const MAX_DIRECTORY_ENTRIES = 256
const MAX_SIGNATURES = 20
const MAX_FIELDS_PER_SIGNATURE = 32
const INVISIBLE_TAGS = new Set(['script', 'style', 'head', 'template', 'noscript', 'iframe', 'object', 'svg', 'math'])
const LINE_TAGS = new Set(['br', 'div', 'p', 'li', 'tr'])

interface SignatureField { key: string; text: string; links: string[] }
interface SignatureCapture { fields: SignatureField[]; image: string }
interface Frame { tag: string; hidden: boolean; signature: SignatureCapture | null; field: SignatureField | null }

function cleanText(value: unknown, max = 500): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').trim().slice(0, max)
}

function isDemo(value: string): boolean {
  return /\bAlex\s+Rivera\b|NovaSphere|tudominio\.|placehold(?:er)?[.\/]|\{\{|escribe aqu[ií]|tu (?:nombre|empresa|cargo)|600[\s-]*000[\s-]*000/i.test(value)
}

function realText(value: unknown, max = 500): string {
  const text = cleanText(value, max)
  return isDemo(text) ? '' : text
}

function emailValue(value: string): string {
  const text = realText(value.replace(/^mailto:/i, '').split('?')[0], 254)
  return /^[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u.test(text) ? text : ''
}

function websiteValue(value: string, allowUploads = false): string {
  let text = realText(value, 1000)
  if (!text || /[\u0000-\u0020<>"']/g.test(text)) return ''
  if (allowUploads && text.startsWith('/uploads/')) {
    try {
      const normalized = new URL(text, 'https://local.invalid')
      return normalized.pathname.startsWith('/uploads/') && !/\\|%2f|%5c/i.test(text) ? normalized.pathname + normalized.search : ''
    } catch { return '' }
  }
  if (/^www\./i.test(text)) text = `https://${text}`
  if (!/^https?:\/\//i.test(text)) return ''
  try {
    const url = new URL(text)
    return url.username || url.password ? '' : url.href
  } catch { return '' }
}

function phoneValue(value: string): string {
  const text = realText(value.replace(/^tel:/i, ''), 80)
  const digits = text.replace(/\D/g, '')
  return /^[+\d()\s.-]+$/.test(text) && digits.length >= 7 && digits.length <= 18 ? text : ''
}

function finishSignature(capture: SignatureCapture): SignatureData | null {
  const first = (key: string) => capture.fields.find(field => field.key === key)?.text ?? ''
  const signature = emptyAssistantSignature()
  signature.name = realText(first('title'), 160)
  signature.details = realText(first('subtitle'), 600)
  signature.imageUrl = websiteValue(capture.image, true)
  signature.ps = realText(first('ps').replace(/^\s*P\s*\.?\s*D\s*\.?\s*[:—-]?\s*/i, ''), 1000)
  for (const field of capture.fields.filter(field => field.key === 'contact')) {
    // Visible contact text wins over an accidentally stale href from an old edit.
    const values = [cleanText(field.text), ...field.links]
    for (const value of values) {
      signature.email ||= emailValue(value)
      signature.website ||= websiteValue(value)
      signature.phone ||= phoneValue(value)
    }
  }
  return signature.name || signature.email || signature.website || signature.phone ? signature : null
}

/** Parse only editor signature blocks. No DOM, scripts, image loads or network requests. */
export function extractEditorSignatures(html: string): SignatureData[] {
  if (!html || Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) return []
  const captures: SignatureCapture[] = []
  const stack: Frame[] = []
  const parser = new Parser({
    onopentag(tag, attributes) {
      const parent = stack.at(-1)
      const hidden = Boolean(parent?.hidden || INVISIBLE_TAGS.has(tag) || 'hidden' in attributes
        || attributes['aria-hidden'] === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attributes.style ?? ''))
      const isSignature = (attributes.class ?? '').split(/\s+/).includes('signature-block')
        || (attributes['data-type'] ?? '').toLowerCase() === 'firma'
      let signature = parent?.signature ?? null
      let field = parent?.field ?? null
      if (isSignature) {
        signature = !hidden && captures.length < MAX_SIGNATURES ? { fields: [], image: '' } : null
        field = null
        if (signature) captures.push(signature)
      }
      const key = attributes['data-toggle']
      if (signature && !hidden && ['title', 'subtitle', 'contact', 'ps'].includes(key)) {
        field = signature.fields.length < MAX_FIELDS_PER_SIGNATURE ? { key, text: '', links: [] } : null
        if (field) signature.fields.push(field)
      }
      if (signature && !hidden && tag === 'img' && !signature.image) signature.image = attributes.src ?? ''
      if (field && !hidden && tag === 'a' && attributes.href && field.links.length < 8) field.links.push(attributes.href)
      if (field && !hidden && tag === 'br') field.text += '\n'
      stack.push({ tag, hidden, signature, field })
    },
    ontext(text) {
      const frame = stack.at(-1)
      if (frame?.field && !frame.hidden && frame.field.text.length < 4000) frame.field.text += text.slice(0, 4000 - frame.field.text.length)
    },
    onclosetag() {
      const frame = stack.pop()
      if (frame?.field && !frame.hidden && LINE_TAGS.has(frame.tag) && frame.field.text.length < 4000) frame.field.text += '\n'
    },
  }, { decodeEntities: true })
  parser.end(html)
  return captures.map(finishSignature).filter((signature): signature is SignatureData => signature !== null)
}

interface CampaignRow { id: number; name: string; subject: string; html: string | null; templateName: string | null; hasHtml: number; usedAt: number }
interface TemplateEntry { name: string; modified: number }

/** Only the public sender identity is used; credentials and audience records are never returned. */
export async function getEditorAssistantContext(): Promise<{
  brand: BrandKit; signatures: SignatureCandidate[]; recentCampaigns: { id: number; name: string; subject: string }[]
}> {
  const brand = sanitizeBrandKit(getBrandKit())
  const rows = sqlite.prepare(`SELECT id, name, subject, template_name AS templateName,
      CASE WHEN length(CAST(template_html AS BLOB)) <= ? THEN template_html ELSE NULL END AS html,
      CASE WHEN length(COALESCE(template_html, '')) > 0 THEN 1 ELSE 0 END AS hasHtml,
      COALESCE(finished_at, started_at, scheduled_at, created_at, 0) AS usedAt
    FROM campaigns WHERE kind = 'regular' ORDER BY usedAt DESC, id DESC LIMIT ?`).all(MAX_HTML_BYTES, MAX_CAMPAIGNS) as CampaignRow[]
  const signatures: SignatureCandidate[] = []
  const seen = new Set<string>()
  const cache = new Map<string, string | null>()
  let fileReads = 0
  let canonicalRoot: string | null = null
  try { canonicalRoot = await realpath(templatesDir) } catch { /* New installations have no saved templates. */ }

  async function readBoundedTemplate(raw: string): Promise<string | null> {
    const name = sanitizeTemplateName(raw)
    if (!name || name === '.' || name === '..' || !canonicalRoot) return null
    if (cache.has(name)) return cache.get(name) ?? null
    if (fileReads >= MAX_TEMPLATE_READS) return null
    cache.set(name, null)
    const filename = path.resolve(templatesDir, `${name}.html`)
    const relative = path.relative(templatesDir, filename)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
    try {
      const meta = await lstat(filename)
      if (!meta.isFile() || meta.isSymbolicLink() || meta.size > MAX_HTML_BYTES) return null
      const canonicalPath = await realpath(filename)
      const canonicalRelative = path.relative(canonicalRoot, canonicalPath)
      if (!canonicalRelative || canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) return null
      fileReads++
      const file = await open(canonicalPath, 'r')
      try {
        const current = await file.stat()
        if (!current.isFile() || current.size > MAX_HTML_BYTES) return null
        // Explicitly cap the read even if a file grows between stat and read.
        const buffer = Buffer.alloc(MAX_HTML_BYTES + 1)
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
        if (bytesRead > MAX_HTML_BYTES) return null
        const html = buffer.subarray(0, bytesRead).toString('utf8')
        cache.set(name, html)
        return html
      } finally { await file.close() }
    } catch { return null }
  }

  function remember(html: string | null, source: Omit<SignatureCandidate, 'signature'>): void {
    if (!html) return
    extractEditorSignatures(html).forEach((signature, index) => {
      const key = JSON.stringify(signature)
      if (seen.has(key) || signatures.length >= MAX_SIGNATURES) return
      seen.add(key)
      signatures.push({ ...source, id: `${source.id}:${index}`, signature })
    })
  }

  for (const row of rows) {
    const html = row.html ?? (!row.hasHtml && row.templateName ? await readBoundedTemplate(row.templateName) : null)
    remember(html, { id: `campaign:${row.id}`, sourceType: 'campaign', sourceName: cleanText(row.name, 200), updatedAt: Number(row.usedAt) * 1000 })
  }

  const templates: TemplateEntry[] = []
  try {
    const directory = await opendir(templatesDir)
    let entries = 0
    for await (const file of directory) {
      if (++entries > MAX_DIRECTORY_ENTRIES) break
      if (!file.isFile() || !file.name.endsWith('.html')) continue
      const name = sanitizeTemplateName(file.name)
      if (!name) continue
      try {
        const meta = await lstat(path.join(templatesDir, file.name))
        if (meta.isFile() && !meta.isSymbolicLink() && meta.size <= MAX_HTML_BYTES) templates.push({ name, modified: meta.mtimeMs })
      } catch { /* Ignore removed files. */ }
    }
  } catch { /* No template directory is a valid empty context. */ }
  templates.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name))
  for (const template of templates.slice(0, MAX_TEMPLATE_READS)) {
    remember(await readBoundedTemplate(template.name), {
      id: `template:${template.name}`, sourceType: 'template', sourceName: template.name, updatedAt: template.modified,
    })
  }

  if (!signatures.length) {
    const config = useServerConfig()
    const signature = emptyAssistantSignature()
    signature.name = realText(config.smtpFromName, 160)
    signature.email = emailValue(String(config.smtpFromEmail ?? ''))
    signature.details = realText(config.companyAddress, 600)
    signature.website = websiteValue(brand.website)
    if (signature.name || signature.email || signature.website) signatures.push({
      id: 'settings:sender', sourceType: 'settings', sourceName: 'Remitente configurado', updatedAt: 0, signature,
    })
  }
  return {
    brand, signatures,
    recentCampaigns: rows.map(row => ({ id: row.id, name: cleanText(row.name, 200), subject: cleanText(row.subject, 300) })),
  }
}
