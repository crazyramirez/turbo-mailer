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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface CompiledTemplate {
  applyTo(contact: Record<string, any>): string
}

/**
 * Compiles a template string once, returning a reusable apply function.
 * Eliminates repeated regex compilation per email — critical at 50k+ scale.
 * Use this in bulk-send loops; use applyVars for one-off substitutions.
 */
export function compileTemplate(tpl: string): CompiledTemplate {
  if (!tpl) return { applyTo: () => '' }

  // Build one combined regex per VAR_MAP field, compiled once for all emails
  const compiled: Array<{ re: RegExp; field: string; aliases: string[] }> = []
  for (const [field, aliases] of Object.entries(VAR_MAP)) {
    const allNames = [field, ...aliases]
    const pattern = allNames.map(n => `\\{\\{\\s*${escapeRegex(n)}\\s*\\}\\}`).join('|')
    compiled.push({ re: new RegExp(pattern, 'gi'), field, aliases })
  }

  return {
    applyTo(contact: Record<string, any>): string {
      let result = tpl

      // 1. VAR_MAP fields using pre-compiled regex
      for (const { re, field, aliases } of compiled) {
        let value = contact[field]
        if (value === undefined) {
          for (const alias of aliases) {
            if (contact[alias] !== undefined) { value = contact[alias]; break }
            const ciKey = Object.keys(contact).find(k => k.toLowerCase() === alias.toLowerCase())
            if (ciKey) { value = contact[ciKey]; break }
          }
        }
        const escaped = escapeHtml(value === null || value === undefined ? '' : String(value))
        re.lastIndex = 0
        result = result.replace(re, escaped)
      }

      // 2. Dynamic keys not covered by VAR_MAP
      for (const [key, value] of Object.entries(contact)) {
        if (key in VAR_MAP) continue
        const escaped = escapeHtml(value === null || value === undefined ? '' : String(value))
        result = result.replace(new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, 'gi'), escaped)
      }

      return result
    }
  }
}

/**
 * One-off variable substitution. For bulk sends, prefer compileTemplate().
 * All contact values are HTML-escaped before insertion.
 */
export function applyVars(tpl: string, contact: Record<string, any>): string {
  if (!tpl) return ''
  let result = tpl

  for (const [field, aliases] of Object.entries(VAR_MAP)) {
    let value = contact[field]
    if (value === undefined) {
      for (const alias of aliases) {
        if (contact[alias] !== undefined) {
          value = contact[alias]
          break
        }
        const ciKey = Object.keys(contact).find(k => k.toLowerCase() === alias.toLowerCase())
        if (ciKey) {
          value = contact[ciKey]
          break
        }
      }
    }

    const finalValue = escapeHtml(value === null || value === undefined ? '' : String(value))

    for (const alias of aliases) {
      const reg = new RegExp(`\\{\\{\\s*${alias}\\s*\\}\\}`, 'gi')
      result = result.replace(reg, finalValue)
    }

    const fieldReg = new RegExp(`\\{\\{\\s*${field}\\s*\\}\\}`, 'gi')
    result = result.replace(fieldReg, finalValue)
  }

  for (const [key, value] of Object.entries(contact)) {
    const finalValue = escapeHtml(value === null || value === undefined ? '' : String(value))
    const reg = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
    result = result.replace(reg, finalValue)
  }

  return result
}
