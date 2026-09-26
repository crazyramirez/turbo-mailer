import path from 'node:path'
import { readFileSync } from 'node:fs'
import { dataPath } from '~/server/utils/data-dir'

// Shared filesystem locations for editor templates and their version history.
export const templatesDir = dataPath('templates')

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

/** Stored template HTML by name, or null (path-traversal safe). */
export function readTemplateFile(raw: string): string | null {
  const name = sanitizeTemplateName(raw)
  if (!name) return null
  const resolved = path.resolve(templatesDir, `${name}.html`)
  const rel = path.relative(templatesDir, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  try {
    return readFileSync(resolved, 'utf-8')
  } catch {
    return null
  }
}
