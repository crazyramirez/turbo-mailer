import { defineEventHandler, readBody } from 'h3';
import fs from 'node:fs/promises';
import path from 'node:path';

export default defineEventHandler(async (event) => {
  const method = event.method;
  const templatesDir = path.resolve(process.cwd(), 'public/templates');
  const baseTemplatePath = path.resolve(process.cwd(), 'docs/email_demo.html');

  // Ensure templates directory exists
  try {
    await fs.access(templatesDir);
  } catch (e) {
    await fs.mkdir(templatesDir, { recursive: true });
  }

  if (method === 'GET') {
    const query = getQuery(event);
    const name = query.name as string;

    if (name) {
      // Load specific template
      const filePath = path.join(templatesDir, name.endsWith('.html') ? name : `${name}.html`);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return { content };
      } catch (e) {
        // Fallback to demo if not found and it's the first time
        if (name === 'email_demo') {
           try {
             const content = await fs.readFile(baseTemplatePath, 'utf-8');
             return { content };
           } catch (e) {
             return { content: '<!DOCTYPE html><html><body><div class="main-card"><h1>Demo Fallback</h1></div></body></html>' };
           }
        }
        throw createError({ statusCode: 404, message: 'Template not found' });
      }
    }

    // List templates
    const files = await fs.readdir(templatesDir);
    const templates = files
      .filter(f => f.endsWith('.html') && f !== 'email_demo.html')
      .map(f => ({
        name: f.replace('.html', ''),
        path: `/templates/${f}`
      }));

    return templates;
  }

  if (method === 'POST') {
    const body = await readBody(event);
    const { name, content } = body;
    
    if (!name || !content) {
      throw createError({ statusCode: 400, message: 'Name and content are required' });
    }

    const fileName = name.endsWith('.html') ? name : `${name}.html`;
    const filePath = path.join(templatesDir, fileName);
    
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, path: `/templates/${fileName}` };
  }

  if (method === 'PATCH') {
    const body = await readBody(event);
    const { oldName, newName } = body;
    
    if (!oldName || !newName) {
      throw createError({ statusCode: 400, message: 'Old and New names are required' });
    }

    const oldPath = path.join(templatesDir, oldName.endsWith('.html') ? oldName : `${oldName}.html`);
    const newPath = path.join(templatesDir, newName.endsWith('.html') ? newName : `${newName}.html`);
    
    try {
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath);
      return { success: true };
    } catch (e) {
      throw createError({ statusCode: 404, message: 'Source template not found' });
    }
  }

  if (method === 'DELETE') {
    const body = await readBody(event);
    const { name } = body;
    
    if (!name) {
      throw createError({ statusCode: 400, message: 'Name is required' });
    }

    const filePath = path.join(templatesDir, name.endsWith('.html') ? name : `${name}.html`);
    await fs.unlink(filePath);
    return { success: true };
  }
});
