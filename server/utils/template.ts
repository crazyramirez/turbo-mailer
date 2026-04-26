/**
 * Variable Aliases Mapping
 * Maps internal field names to common external names (Spanish, English, etc.)
 */
export const VAR_MAP: Record<string, string[]> = {
  name: ['Nombre', 'Name', 'FirstName', 'First Name', 'Contacto', 'Contact'],
  company: ['Empresa', 'Company', 'Business', 'Organization'],
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

/**
 * Robust variable replacement function.
 * Supports English/Spanish aliases and is case-insensitive.
 * All contact values are HTML-escaped before insertion.
 */
export function applyVars(tpl: string, contact: Record<string, any>): string {
  if (!tpl) return ''
  let result = tpl

  // 1. Process defined mappings
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

  // 2. Handle dynamic variables not covered by VAR_MAP
  for (const [key, value] of Object.entries(contact)) {
    const finalValue = escapeHtml(value === null || value === undefined ? '' : String(value))
    const reg = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
    result = result.replace(reg, finalValue)
  }

  return result
}
