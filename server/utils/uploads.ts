import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { dataPath } from '~/server/utils/data-dir'
import { assertPublicHttpUrl } from '~/server/utils/ssrf-guard'

// Image library for emails.
//
// Files live in DATA_DIR/uploads (writable, survives rebuilds and is inside
// the backup/Docker volume) and are served by server/routes/uploads. The old
// location ./public/uploads is still read for files uploaded before; new
// uploads never go there — in a production build Nitro only serves the
// public/ snapshot taken at build time, so runtime uploads there were 404s
// in every email.
//
// Only real raster images are accepted: the bytes are decoded by sharp and
// re-encoded. SVG is refused (it can carry script and most email clients
// don't render it anyway).

export const uploadDir = dataPath('uploads')
export const legacyUploadDir = path.resolve(process.cwd(), 'public', 'uploads')

export const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const MAX_WIDTH = 1200

export const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/** Safe basename: no paths, only [A-Za-z0-9._-], image extension required. */
export function sanitizeUploadName(name: string): string | null {
  const base = path.basename(String(name ?? '')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)
  if (!base || base.startsWith('.') || !IMAGE_EXT.test(base)) return null
  return base
}

/** Absolute path of an existing upload (new dir first, then legacy), or null. */
export function resolveUpload(name: string): string | null {
  const clean = sanitizeUploadName(name)
  if (!clean) return null
  for (const dir of [uploadDir, legacyUploadDir]) {
    const p = path.join(dir, clean)
    if (path.dirname(p) === dir && existsSync(p)) return p
  }
  return null
}

export async function listUploads(): Promise<{ name: string; url: string; size: number; mtime: number }[]> {
  const out = new Map<string, { name: string; url: string; size: number; mtime: number }>()
  for (const dir of [legacyUploadDir, uploadDir]) {
    let files: string[] = []
    try { files = await fs.readdir(dir) } catch { continue }
    for (const f of files) {
      if (!IMAGE_EXT.test(f)) continue
      try {
        const st = await fs.stat(path.join(dir, f))
        out.set(f, { name: f, url: `/uploads/${encodeURIComponent(f)}`, size: st.size, mtime: st.mtimeMs })
      } catch {}
    }
  }
  return [...out.values()].sort((a, b) => b.mtime - a.mtime)
}

/**
 * Validates and normalizes an image, then stores it. Throws on anything that
 * isn't a decodable raster image.
 */
export async function saveImage(buffer: Buffer, originalName: string, prefix = ''): Promise<{ name: string; url: string }> {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error('Imagen demasiado grande (máx. 15 MB)')
  let meta: sharp.Metadata
  try {
    meta = await sharp(buffer, { animated: true }).metadata()
  } catch {
    throw new Error('El archivo no es una imagen válida')
  }
  const format = meta.format
  if (!format || !['jpeg', 'png', 'gif', 'webp'].includes(format)) {
    throw new Error(`Formato no admitido (${format ?? 'desconocido'}). Usa JPG, PNG, GIF o WebP.`)
  }

  // WebP becomes a still JPEG/PNG: decoding every frame would stack them into one tall image
  const img = sharp(buffer, { animated: format === 'gif' }).rotate()
  const resized = meta.width && meta.width > MAX_WIDTH ? img.resize(MAX_WIDTH) : img
  let out: Buffer
  let ext: string
  switch (format) {
    case 'png': out = await resized.png({ compressionLevel: 9, palette: true }).toBuffer(); ext = '.png'; break
    case 'gif': out = await resized.gif().toBuffer(); ext = '.gif'; break
    // WebP is not rendered by Outlook desktop — store email-safe JPEG, or PNG
    // when it has transparency (a logo would otherwise get a black box)
    case 'webp':
      if (meta.hasAlpha) { out = await resized.png({ compressionLevel: 9 }).toBuffer(); ext = '.png' }
      else { out = await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer(); ext = '.jpg' }
      break
    default: out = await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer(); ext = '.jpg'
  }

  const stem = path.basename(String(originalName || 'imagen'), path.extname(String(originalName || '')))
    .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'imagen'
  const name = `${prefix}${Date.now()}-${stem}${ext}`
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, name), out)
  return { name, url: `/uploads/${name}` }
}

/**
 * Fetches a public image (SSRF-guarded, every redirect hop re-validated,
 * 15MB cap). Returns the raw bytes; pass them to saveImage() to store them.
 */
export async function downloadRemoteImage(url: string): Promise<Buffer> {
  // SSRF guard: only public http(s) hosts, no private/metadata ranges
  let currentUrl = await assertPublicHttpUrl(url)
  let response: Response | null = null
  for (let hop = 0; hop < 4; hop++) {
    response = await fetch(currentUrl.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location')
      if (!loc) throw new Error('Redirect without Location header')
      currentUrl = await assertPublicHttpUrl(new URL(loc, currentUrl).href)
      continue
    }
    break
  }
  if (!response) throw new Error('Fetch failed')
  if (response.status >= 300 && response.status < 400) throw new Error('Too many redirects')
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)

  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error(`URL did not return a valid image type. Type: ${contentType}`)
  }
  if (Number(response.headers.get('content-length') || 0) > MAX_UPLOAD_BYTES) throw new Error('Image too large (max 15MB)')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error('Image too large (max 15MB)')
  return buffer
}
