import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { resolveUpload, MIME_BY_EXT } from '~/server/utils/uploads'

// Public image serving for emails (/uploads/<file>). Recipients' mail clients
// and image proxies fetch these, so no auth; only validated raster images
// from the upload directories can be reached.
export default defineEventHandler((event) => {
  const raw = decodeURIComponent(String(getRouterParam(event, 'path') ?? ''))
  if (raw.includes('/') || raw.includes('\\')) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const file = resolveUpload(raw)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const st = statSync(file)
  setHeader(event, 'Content-Type', MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  setHeader(event, 'Content-Length', st.size)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Security-Policy', "default-src 'none'; sandbox")
  // Mail image proxies (Gmail, Outlook) fetch cross-origin
  setHeader(event, 'Cross-Origin-Resource-Policy', 'cross-origin')
  return sendStream(event, createReadStream(file))
})
