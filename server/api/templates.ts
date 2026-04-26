import { defineEventHandler, readBody } from 'h3';
import fs from 'node:fs/promises';
import path from 'node:path';

const templatesDir = path.resolve(process.cwd(), 'data/templates');
const baseTemplatePath = path.resolve(process.cwd(), 'data/demo/email_demo.html');

function sanitizeName(raw: string): string | null {
  const name = String(raw).replace(/\.html$/i, '')
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) return null
  return name
}

function safePath(name: string): string | null {
  const resolved = path.resolve(templatesDir, `${name}.html`)
  if (!resolved.startsWith(templatesDir + path.sep) && resolved !== templatesDir) return null
  return resolved
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
      if (!filePath) throw createError({ statusCode: 400, message: 'Invalid template name' })

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (isPreview) {
          setResponseHeader(event, 'Content-Type', 'text/html');
          return content;
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
    return files
      .filter(f => f.endsWith('.html'))
      .map(f => ({
        name: f.replace('.html', ''),
        path: `/api/templates?name=${f.replace('.html', '')}&preview=1`
      }));
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
    return { success: true };
  }
});
