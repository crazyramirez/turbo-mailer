import { editorBlocks } from '~/utils/editorBlocks'
import { editorStyleBases } from '~/utils/editorStyles'
import type { BlockFields, PlannedBlock } from '~/utils/emailAssembler'

const TEXT_FIELDS = new Set(['title', 'subtitle', 'badge', 'button', 'logo', 'price', 'code', 'contact', 'ps'])

/** The AI contract follows the actual editable slots, including repeated slots. */
export const EDITOR_AI_CATALOG = editorBlocks.map(({ id, name, content }) => {
  const slots: Record<string, number> = {}
  for (const match of content.matchAll(/\bdata-toggle\s*=\s*["']([^"']+)["']/g)) {
    const field = match[1] === 'image' ? 'images' : match[1] === 'pricing-feature' ? 'features' : match[1]
    if (field === 'images' || field === 'features' || TEXT_FIELDS.has(field)) slots[field] = (slots[field] || 0) + 1
  }
  if (slots.button) slots.buttonUrl = slots.button
  const socialCount = [...content.matchAll(/\bclass\s*=\s*["']([^"']+)["']/g)].filter(match => match[1].split(/\s+/).includes('social-item')).length
  if (socialCount) slots.socialUrls = socialCount
  if (id === 'video' && slots.images) slots.videoUrl = 1
  return { id, name, slots }
})

export const EDITOR_AI_BLOCK_IDS = EDITOR_AI_CATALOG.map(block => block.id)
export const EDITOR_AI_STYLE_IDS = editorStyleBases.map(style => style.id)

export interface EditorAiSignature {
  name: string
  details: string
  email: string
  website: string
  phone: string
  imageUrl: string
  ps: string
}

/** Email links must be usable outside the application, or be send-time variables. */
export function normalizeEditorAiHref(raw: string): string | null {
  const value = raw.trim()
  if (!value || /[\u0000-\u0020\u007f<>"\\]/.test(value.replace(/ /g, '')) || /[\r\n\t]/.test(value)) return null
  if (/^\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}$/.test(value)) return value
  if (/^mailto:[^\s@?]+@[^\s@?]+(?:\?[^\r\n]*)?$/i.test(value)) return value
  if (/^tel:\+?[\d][\d(). -]*$/i.test(value)) return value
  const qualified = /^[a-z0-9](?:[a-z0-9.-]*\.)[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value) ? `https://${value}` : value
  try {
    const parsed = new URL(qualified)
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null
    return qualified
  } catch { return null }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function values(value: unknown, count: number): string[] {
  return (Array.isArray(value) ? value : [value]).slice(0, count).map(item => typeof item === 'string' ? item.trim().slice(0, 12000) : '')
}

function signatureText(value: string): string {
  return (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?|\n/g, '<br>')
}

export function normalizeEditorAiBlocks(
  input: unknown,
  options: { ctaUrl?: string; signature?: EditorAiSignature | null; includeSignature?: boolean } = {},
): { blocks: PlannedBlock[]; warnings: string[] } {
  const warnings = new Set<string>()
  const blocks: PlannedBlock[] = []
  let footer: PlannedBlock | undefined
  const fallbackUrl = normalizeEditorAiHref(options.ctaUrl || '')
  const controlledSignature = options.includeSignature === false || Object.prototype.hasOwnProperty.call(options, 'signature')
  if (!Array.isArray(input)) warnings.add('La respuesta no contenía una lista válida de módulos.')
  if (Array.isArray(input) && input.length > 40) warnings.add('Se ha limitado la campaña a 40 módulos.')

  for (const source of (Array.isArray(input) ? input : []).slice(0, 40)) {
    if (!record(source) || typeof source.id !== 'string') { warnings.add('Se ha omitido un módulo sin identificador válido.'); continue }
    const catalog = EDITOR_AI_CATALOG.find(block => block.id === source.id)
    if (!catalog) { warnings.add(`Se ha omitido el módulo desconocido «${source.id.slice(0, 80)}».`); continue }
    if (source.id === 'signature' && controlledSignature) continue
    const fields: BlockFields = {}
    const incoming = record(source.fields) ? source.fields : {}
    for (const [rawKey, value] of Object.entries(incoming)) {
      const key = rawKey === 'image' ? 'images' : rawKey
      const count = Object.prototype.hasOwnProperty.call(catalog.slots, key) ? catalog.slots[key] : 0
      if (!count) {
        const hasContent = (Array.isArray(value) ? value : [value]).some(item => typeof item === 'string' ? !!item.trim() : item != null)
        if (hasContent) warnings.add(`Se han descartado campos incompatibles con el módulo «${catalog.name}».`)
        continue
      }
      if (Array.isArray(value) && value.length > count) warnings.add(`Se han ajustado los campos repetidos del módulo «${catalog.name}» a sus espacios disponibles.`)
      const list = values(value, count)
      if (['buttonUrl', 'socialUrls', 'videoUrl'].includes(key)) {
        list.forEach((item, i) => {
          const normalized = normalizeEditorAiHref(item)
          const safe = key === 'buttonUrl' || /^https?:\/\//i.test(normalized || '') ? normalized : null
          if (item && !safe) warnings.add('Se ha descartado un enlace no válido.')
          list[i] = safe || ''
        })
      }
      fields[key as keyof BlockFields] = count === 1 ? list[0] || '' : list
    }
    if (catalog.slots.button && fallbackUrl) {
      const labels = values(fields.button, catalog.slots.button)
      const urls = values(fields.buttonUrl, catalog.slots.button)
      const result = Array.from({ length: catalog.slots.button }, (_, i) => urls[i] || (labels[i] ? fallbackUrl : ''))
      fields.buttonUrl = catalog.slots.button === 1 ? result[0] : result
    }
    const block = { id: catalog.id, fields }
    if (catalog.id === 'unsubscribe') {
      if (footer) warnings.add('Se ha mantenido un único pie de baja al final de la campaña.')
      footer ??= block
    } else blocks.push(block)
  }

  if (options.includeSignature !== false && options.signature) {
    const signature = options.signature
    if (Object.values(signature).some(value => typeof value === 'string' && value.trim())) {
      blocks.push({ id: 'signature', fields: {
        title: signatureText(signature.name), subtitle: signatureText(signature.details),
        contact: [signature.email || '', signature.website || '', signature.phone || ''],
        images: signature.imageUrl || '', ps: signatureText(signature.ps),
      } })
    }
  }
  blocks.push(footer || { id: 'unsubscribe', fields: {} })
  return { blocks, warnings: [...warnings] }
}
