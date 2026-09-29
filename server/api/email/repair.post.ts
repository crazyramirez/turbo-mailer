import { repairEmailHtml } from '~/server/utils/email-repair'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'

// Repairs HTML that isn't stored yet — the AI assistants run it on every
// generated email so the draft arrives already Outlook-ready (see email-repair.ts).

const MAX_HTML_BYTES = 2 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const body = await readBody<{ html?: unknown }>(event)
  const html = typeof body?.html === 'string' ? body.html : ''
  if (!html.trim() || Buffer.byteLength(html, 'utf-8') > MAX_HTML_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'HTML vacío o demasiado grande (máx. 2 MB)' })
  }
  const repaired = await repairEmailHtml(html, { localOrigin: String(useServerConfig().trackingBaseUrl || '') || null })
  return { html: repaired.changes.length ? sanitizeEmailHtml(repaired.html) : html, changes: repaired.changes }
})
