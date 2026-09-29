/**
 * Variable Aliases Mapping
 * Maps internal field names to common external names (Spanish, English, etc.)
 */
export const VAR_MAP: Record<string, string[]> = {
  name: ['Nombre', 'Name', 'FirstName', 'First Name', 'Contacto', 'Contact'],
  company: [
    'Empresa', 'Company', 'Business', 'Organization',
    'Agencia', 'Agency', 'agency_name', 'nombre_agencia',
    'Agency Name', 'agencyname', 'nombreagencia'
  ],
  role: ['Puesto', 'Cargo', 'Role', 'Position', 'JobTitle', 'Job Title'],
  city: ['Ciudad', 'City', 'Location', 'Poblacion', 'Población'],
  country: ['Pais', 'País', 'Country', 'Nacion', 'Nación'],
  service: ['Servicio', 'Service', 'Producto', 'Product', 'Offer'],
  url: ['URL', 'Link', 'Web', 'Website'],
  linkedin: ['Linkedin', 'LinkedIn'],
  instagram: ['Instagram', 'IG'],
  youtube: ['Youtube', 'YouTube', 'YT'],
  phone: ['Telefono', 'Teléfono', 'Phone', 'Cell', 'Mobile'],
  email: ['Email', 'Correo', 'Mail']
}

// Placeholders filled later by the send pipeline — never blanked here
const SYSTEM_PLACEHOLDERS = new Set(['UNSUBSCRIBE_URL', 'PREFERENCES_URL', 'COMPANY_ADDRESS', 'WEB_VERSION_URL'])

// Alias (lowercased) → canonical field
const ALIAS_TO_FIELD = new Map<string, string>()
for (const [field, aliases] of Object.entries(VAR_MAP)) {
  ALIAS_TO_FIELD.set(field.toLowerCase(), field)
  for (const a of aliases) ALIAS_TO_FIELD.set(a.toLowerCase(), field)
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export interface CompiledTemplate {
  applyTo(contact: Record<string, any>): string
}

/** Case-insensitive lookup honouring the alias table (Nombre → name...). */
export function lookupVar(contact: Record<string, any>, rawName: string): unknown {
  const name = rawName.trim()
  if (name in contact) return contact[name]
  const lower = name.toLowerCase()
  const field = ALIAS_TO_FIELD.get(lower)
  if (field) {
    if (contact[field] !== undefined) return contact[field]
    // The contact object may carry an alias key itself (e.g. CSV column "Empresa")
    for (const alias of [field, ...VAR_MAP[field]]) {
      const key = Object.keys(contact).find(k => k.toLowerCase() === alias.toLowerCase())
      if (key !== undefined && contact[key] !== undefined) return contact[key]
    }
    return undefined
  }
  const key = Object.keys(contact).find(k => k.toLowerCase() === lower)
  return key !== undefined ? contact[key] : undefined
}

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false
  if (typeof v === 'number') return v !== 0
  const s = String(v).trim().toLowerCase()
  return s !== '' && s !== 'false' && s !== '0'
}

// {{#if field}}…{{else}}…{{/if}}, {{#if field == "x"}}, {{#unless field}}…{{/unless}}
// Innermost blocks first, so nesting works.
const IF_RE = /\{\{\s*#(if|unless)\s+([^}]+?)\s*\}\}((?:(?!\{\{\s*#(?:if|unless)\b)[\s\S])*?)\{\{\s*\/\1\s*\}\}/i
const COND_RE = /^([\p{L}\w .-]+?)\s*(==|!=)\s*"([^"]*)"$/u

function evalCondition(expr: string, contact: Record<string, any>): boolean {
  const m = expr.trim().match(COND_RE)
  if (m) {
    const actual = String(lookupVar(contact, m[1]) ?? '').trim().toLowerCase()
    const expected = m[3].trim().toLowerCase()
    return m[2] === '==' ? actual === expected : actual !== expected
  }
  return isTruthy(lookupVar(contact, expr))
}

function resolveConditionals(tpl: string, contact: Record<string, any>): string {
  let out = tpl
  for (let guard = 0; guard < 200; guard++) {
    const m = IF_RE.exec(out)
    if (!m) break
    const [whole, kind, expr, body] = m
    const [whenTrue, whenFalse = ''] = body.split(/\{\{\s*else\s*\}\}/i)
    let cond = evalCondition(expr, contact)
    if (kind.toLowerCase() === 'unless') cond = !cond
    out = out.slice(0, m.index) + (cond ? whenTrue : whenFalse) + out.slice(m.index + whole.length)
  }
  return out
}

// {{ name }}, {{ name | "amigo" }}, {{ name | default: "amigo" }}
const VAR_RE = /\{\{\s*([\p{L}_][\p{L}\w .-]{0,60}?)\s*(?:\|\s*(?:default\s*:\s*)?"([^"]*)"\s*)?\}\}/gu

// Marks a merge tag that rendered empty, so the punctuation around it can be
// tidied: "{{company}}, ¿qué…" → "¿Qué…", "Hola {{name}}," → "Hola,".
const EMPTY = '\u0000'

function tidyEmptyTags(out: string): string {
  if (!out.includes(EMPTY)) return out
  return out
    // Leading tag + separator at the start of the text (subject) or of an element's text
    .replace(/(^|>)(\s*)\u0000\s*[,;:]\s*([¿¡]?)(\p{Ll}?)/gu, (_m, lead: string, ws: string, mark: string, letter: string) =>
      lead + ws + mark + letter.toUpperCase())
    .replace(/[ \t]+\u0000(?=[,.!?;:)])/g, '')
    .replace(/([ \t])\u0000[ \t]+/g, '$1')
    .replace(/\u0000/g, '')
}

function substitute(tpl: string, contact: Record<string, any>): string {
  return tidyEmptyTags(tpl.replace(VAR_RE, (whole, rawName: string, fallback: string | undefined) => {
    const name = rawName.trim()
    if (SYSTEM_PLACEHOLDERS.has(name.toUpperCase())) return whole
    const value = lookupVar(contact, name)
    const str = value === null || value === undefined ? '' : String(value)
    const out = !str.trim() && fallback !== undefined ? escapeHtml(fallback) : escapeHtml(str)
    return out.trim() ? out : EMPTY
  }))
}

/**
 * Compiles a template once for reuse across many contacts. Supports aliases,
 * conditionals and fallbacks; every contact value is HTML-escaped. Unknown
 * or empty merge tags render empty (never a raw "{{tag}}" in someone's inbox)
 * and don't leave a dangling comma behind;
 * system placeholders (UNSUBSCRIBE_URL...) are left for the pipeline.
 */
export function compileTemplate(tpl: string): CompiledTemplate {
  if (!tpl) return { applyTo: () => '' }
  const hasBlocks = /\{\{\s*#(if|unless)\b/i.test(tpl)
  return {
    applyTo(contact: Record<string, any>): string {
      const safe = contact ?? {}
      return substitute(hasBlocks ? resolveConditionals(tpl, safe) : tpl, safe)
    },
  }
}

/** One-off variable substitution. All contact values are HTML-escaped. */
export function applyVars(tpl: string, contact: Record<string, any>): string {
  return compileTemplate(tpl).applyTo(contact)
}

/** Merge tags used by a template (for the editor's variable picker / lint). */
export function listMergeTags(tpl: string): string[] {
  const out = new Set<string>()
  for (const m of tpl.matchAll(VAR_RE)) {
    const name = m[1].trim()
    if (!SYSTEM_PLACEHOLDERS.has(name.toUpperCase())) out.add(name)
  }
  return [...out]
}
