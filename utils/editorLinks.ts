// Validación de URLs para enlaces insertados en plantillas de email.
// Bloquea esquemas ejecutables (javascript:, data:, etc.) que además disparan filtros de spam.
// Se permiten URLs sin esquema (relativas, anclas, variables {{...}}).
export function sanitizeLinkUrl(raw: string): string | null {
  const url = (raw || '').trim()
  if (!url) return null
  const scheme = url.match(/^([a-z][a-z0-9+.-]*)\s*:/i)?.[1]?.toLowerCase()
  if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme)) return null
  return url
}
