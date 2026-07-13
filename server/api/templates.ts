import { defineEventHandler, readBody, send, getQuery, createError, setResponseHeader } from 'h3';
import fs from 'node:fs/promises';
import path from 'node:path';
import { templatesDir, versionsDirFor, sanitizeTemplateName as sanitizeName } from '~/server/utils/template-files';

const baseTemplatePath = path.resolve(process.cwd(), 'data/demo/email_demo.html');

function safePath(name: string): string | null {
  const resolved = path.resolve(templatesDir, `${name}.html`)
  const relative = path.relative(templatesDir, resolved)
  // Ensure the resolved path is inside templatesDir and not the directory itself
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') return null
  return resolved
}

// ── Version history ─────────────────────────────────────────────────────
// Before each overwrite, the previous content is snapshotted to
// data/templates/.versions/<name>/<epoch-ms>.html. Autosave fires every few
// seconds, so snapshots are throttled: a new one only when the latest is
// older than SNAPSHOT_MIN_GAP_MS. Oldest pruned beyond MAX_VERSIONS.
const SNAPSHOT_MIN_GAP_MS = 5 * 60 * 1000
const MAX_VERSIONS = 10

async function snapshotVersion(name: string, filePath: string, newContent: string): Promise<void> {
  let previous: string
  try {
    previous = await fs.readFile(filePath, 'utf-8')
  } catch {
    return // first save — nothing to snapshot
  }
  if (previous === newContent) return

  const dir = versionsDirFor(name)
  try {
    await fs.mkdir(dir, { recursive: true })
    const existing = (await fs.readdir(dir))
      .filter(f => /^\d+\.html$/.test(f))
      .sort((a, b) => Number(b.replace('.html', '')) - Number(a.replace('.html', '')))

    const newestTs = existing.length ? Number(existing[0].replace('.html', '')) : 0
    if (Date.now() - newestTs < SNAPSHOT_MIN_GAP_MS) return

    await fs.writeFile(path.join(dir, `${Date.now()}.html`), previous, 'utf-8')

    for (const stale of existing.slice(MAX_VERSIONS - 1)) {
      await fs.unlink(path.join(dir, stale)).catch(() => {})
    }
  } catch (err: any) {
    // Versioning must never block a save
    console.warn(`[templates] snapshot failed for ${name}: ${err?.message}`)
  }
}

export default defineEventHandler(async (event) => {
  const method = event.method;

  await fs.mkdir(templatesDir, { recursive: true });

  if (method === 'GET') {
    const query = getQuery(event);
    const rawName = query.name as string;
    const isPreview = query.preview === '1';

    if (rawName) {
      const name = sanitizeName(rawName)
      if (!name) throw createError({ statusCode: 400, message: 'Invalid template name' })

      const filePath = safePath(name)
      if (!filePath) throw createError({ statusCode: 400, message: 'Invalid template path' })

      try {
        console.log(`[templates] Reading: ${filePath}`)
        const content = await fs.readFile(filePath, 'utf-8');
        if (isPreview) {
          return send(event, content, 'text/html');
        }
        return { content };
      } catch {
        if (name === 'email_demo') {
          try {
            const content = await fs.readFile(baseTemplatePath, 'utf-8');
            if (isPreview) {
              setResponseHeader(event, 'Content-Type', 'text/html');
              return content;
            }
            return { content };
          } catch {
            const fallback = '<!DOCTYPE html><html><body><h1>Demo Fallback</h1></body></html>';
            if (isPreview) {
              setResponseHeader(event, 'Content-Type', 'text/html');
              return fallback;
            }
            return { content: fallback };
          }
        }
        throw createError({ statusCode: 404, message: 'Template not found' });
      }
    }

    const files = await fs.readdir(templatesDir);
    const templatesWithStats = await Promise.all(
      files
        .filter(f => f.endsWith('.html'))
        .map(async (f) => {
          const name = f.replace('.html', '');
          const filePath = path.join(templatesDir, f);
          try {
            const stats = await fs.stat(filePath);
            return {
              name,
              path: `/api/templates?name=${encodeURIComponent(name)}&preview=1`,
              createdAt: stats.birthtimeMs || stats.mtimeMs || 0
            };
          } catch {
            return {
              name,
              path: `/api/templates?name=${encodeURIComponent(name)}&preview=1`,
              createdAt: 0
            };
          }
        })
    );

    // Sort by createdAt descending (newest first)
    templatesWithStats.sort((a, b) => b.createdAt - a.createdAt);

    return templatesWithStats.map(({ name, path }) => ({ name, path }));
  }

  if (method === 'POST') {
    const body = await readBody(event);
    const { name: rawName, content } = body;

    if (!rawName || !content) throw createError({ statusCode: 400, message: 'Name and content are required' });

    const name = sanitizeName(rawName)
    if (!name) throw createError({ statusCode: 400, message: 'Invalid template name' })

    const filePath = safePath(name)
    if (!filePath) throw createError({ statusCode: 400, message: 'Invalid template name' })

    if (typeof content !== 'string' || content.length > 5_000_000) {
      throw createError({ statusCode: 400, message: 'Content too large' })
    }

    await snapshotVersion(name, filePath, content);
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, path: `/api/templates?name=${name}&preview=1` };
  }

  if (method === 'PATCH') {
    const body = await readBody(event);
    const { oldName: rawOld, newName: rawNew } = body;

    if (!rawOld || !rawNew) throw createError({ statusCode: 400, message: 'Old and New names are required' });

    const oldName = sanitizeName(rawOld)
    const newName = sanitizeName(rawNew)
    if (!oldName || !newName) throw createError({ statusCode: 400, message: 'Invalid template name' })

    const oldPath = safePath(oldName)
    const newPath = safePath(newName)
    if (!oldPath || !newPath) throw createError({ statusCode: 400, message: 'Invalid template name' })

    try {
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath);
      // Carry the version history along with the rename
      await fs.rename(versionsDirFor(oldName), versionsDirFor(newName)).catch(() => {})
      return { success: true };
    } catch {
      throw createError({ statusCode: 404, message: 'Source template not found' });
    }
  }

  if (method === 'DELETE') {
    const body = await readBody(event);
    const { name: rawName } = body;

    if (!rawName) throw createError({ statusCode: 400, message: 'Name is required' });

    const name = sanitizeName(rawName)
    if (!name) throw createError({ statusCode: 400, message: 'Invalid template name' })

    const filePath = safePath(name)
    if (!filePath) throw createError({ statusCode: 400, message: 'Invalid template name' })

    await fs.unlink(filePath);
    await fs.rm(versionsDirFor(name), { recursive: true, force: true }).catch(() => {})
    return { success: true };
  }
});
