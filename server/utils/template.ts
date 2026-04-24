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

/**
 * Robust variable replacement function.
 * Supports English/Spanish aliases and is case-insensitive.
 */
export function applyVars(tpl: string, contact: Record<string, any>): string {
  if (!tpl) return ''
  let result = tpl

  // 1. Process defined mappings
  for (const [field, aliases] of Object.entries(VAR_MAP)) {
    // Try to find the value in the contact object using the field name or any of its aliases
    let value = contact[field]
    if (value === undefined) {
      for (const alias of aliases) {
        if (contact[alias] !== undefined) {
          value = contact[alias]
          break
        }
        // Try case-insensitive key lookup
        const ciKey = Object.keys(contact).find(k => k.toLowerCase() === alias.toLowerCase())
        if (ciKey) {
          value = contact[ciKey]
          break
        }
      }
    }
    
    const finalValue = value === null || value === undefined ? '' : String(value)

    // Replace all aliases in the template (case-insensitive)
    for (const alias of aliases) {
      const reg = new RegExp(`\\{\\{\\s*${alias}\\s*\\}\\}`, 'gi')
      result = result.replace(reg, finalValue)
    }

    // Also replace the internal field name
    const fieldReg = new RegExp(`\\{\\{\\s*${field}\\s*\\}\\}`, 'gi')
    result = result.replace(fieldReg, finalValue)
  }

  // 2. Handle dynamic variables (any key in the contact object that wasn't covered)
  for (const [key, value] of Object.entries(contact)) {
    const finalValue = value === null || value === undefined ? '' : String(value)
    const reg = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
    result = result.replace(reg, finalValue)
  }

  return result
}
