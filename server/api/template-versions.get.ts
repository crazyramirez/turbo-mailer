import fs from 'node:fs/promises'
import path from 'node:path'
import { versionsDirFor, sanitizeTemplateName as sanitizeName } from '~/server/utils/template-files'

// Template version history.
// GET /api/template-versions?name=X            → [{ ts, size }]
// GET /api/template-versions?name=X&ts=<epoch> → { content }

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const name = sanitizeName(String(query.name || ''))
  if (!name) throw createError({ statusCode: 400, message: 'Invalid template name' })

  const dir = versionsDirFor(name)

  if (query.ts) {
    const ts = String(query.ts)
    if (!/^\d{10,16}$/.test(ts)) throw createError({ statusCode: 400, message: 'Invalid version id' })
    try {
      const content = await fs.readFile(path.join(dir, `${ts}.html`), 'utf-8')
      return { content }
    } catch {
      throw createError({ statusCode: 404, message: 'Version not found' })
    }
  }

  try {
    const files = (await fs.readdir(dir)).filter(f => /^\d+\.html$/.test(f))
    const versions = await Promise.all(files.map(async (f) => {
      const stat = await fs.stat(path.join(dir, f))
      return { ts: Number(f.replace('.html', '')), size: stat.size }
    }))
    versions.sort((a, b) => b.ts - a.ts)
    return versions
  } catch {
    return [] // no history yet
  }
})
