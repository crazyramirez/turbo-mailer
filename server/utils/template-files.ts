import path from 'node:path'

// Shared filesystem locations for editor templates and their version history.
export const templatesDir = path.resolve(process.cwd(), 'data/templates')

export function versionsDirFor(name: string): string {
  return path.join(templatesDir, '.versions', name)
}

export function sanitizeTemplateName(raw: string): string | null {
  const name = String(raw).replace(/\.html$/i, '').trim()
  if (name.length === 0 || name.length > 100) return null
  // Evitar caracteres peligrosos para nombres de archivo en cualquier OS
  if (/[<>:"/\\|?*]/.test(name)) return null
  return name
}
