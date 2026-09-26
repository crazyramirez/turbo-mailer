import { sqlite } from '~/server/db/index'

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select'

export interface CustomFieldDef {
  id: number
  key: string
  label: string
  type: CustomFieldType
  options: string[] | null
  sortOrder: number
}

// Reserved: built-in contact columns and template system variables
export const RESERVED_KEYS = new Set([
  'id', 'email', 'name', 'company', 'role', 'phone', 'linkedin', 'url', 'youtube', 'instagram',
  'tags', 'status', 'created_at', 'updated_at', 'unsubscribe_url', 'preferences_url', 'company_address', 'locale',
])

export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/

/** "Fecha de nacimiento" → "fecha_de_nacimiento" */
export function normalizeFieldKey(label: string): string {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40)
}

let cache: { at: number; defs: CustomFieldDef[] } | null = null

export function listCustomFields(): CustomFieldDef[] {
  if (cache && Date.now() - cache.at < 10_000) return cache.defs
  try {
    const rows = sqlite.prepare('SELECT id, key, label, type, options, sort_order AS sortOrder FROM custom_fields ORDER BY sort_order, id').all() as any[]
    const defs = rows.map(r => ({ ...r, options: r.options ? JSON.parse(r.options) : null })) as CustomFieldDef[]
    cache = { at: Date.now(), defs }
    return defs
  } catch {
    return []
  }
}

export function invalidateCustomFieldCache(): void {
  cache = null
}

/** Coerces one raw value to the field's type; undefined = invalid → dropped. */
export function coerceFieldValue(def: Pick<CustomFieldDef, 'type' | 'options'>, raw: unknown): string | number | boolean | null | undefined {
  if (raw === null || raw === undefined || raw === '') return null
  switch (def.type) {
    case 'number': {
      const n = Number(String(raw).replace(',', '.'))
      return Number.isFinite(n) ? n : undefined
    }
    case 'boolean': {
      const s = String(raw).trim().toLowerCase()
      if (['true', '1', 'yes', 'si', 'sí', 'y', 'x'].includes(s)) return true
      if (['false', '0', 'no', 'n'].includes(s)) return false
      return undefined
    }
    case 'date': {
      const s = String(raw).trim()
      // Accept YYYY-MM-DD and DD/MM/YYYY; store ISO date
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
    }
    case 'select': {
      const s = String(raw).trim()
      if (!def.options?.length) return s.slice(0, 255)
      const hit = def.options.find(o => o.toLowerCase() === s.toLowerCase())
      return hit ?? undefined
    }
    default:
      return String(raw).trim().slice(0, 1000)
  }
}

/** Keeps only defined custom fields, coerced to their type. */
export function sanitizeCustomValues(input: unknown): Record<string, string | number | boolean | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const defs = new Map(listCustomFields().map(d => [d.key, d]))
  const out: Record<string, string | number | boolean | null> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const def = defs.get(k)
    if (!def) continue
    const coerced = coerceFieldValue(def, v)
    if (coerced !== undefined) out[k] = coerced
  }
  return out
}
