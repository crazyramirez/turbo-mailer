import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import * as h3 from 'h3'

const env = await vi.hoisted(async () => {
  const { bootIsolatedEnv } = await import('./harness')
  return bootIsolatedEnv()
})

for (const key of ['defineEventHandler', 'readBody', 'getRouterParam', 'getHeader', 'getQuery', 'getRequestIP'] as const) {
  vi.stubGlobal(key, h3[key])
}

const { sqlite } = await import('~/server/db/index')
const router = h3.createRouter()
router.post('/api/campaigns/:id/repair', (await import('~/server/api/campaigns/[id]/repair.post')).default)
router.post('/api/campaigns/:id/apply-edits', (await import('~/server/api/campaigns/[id]/apply-edits.post')).default)
router.put('/api/campaigns/:id', (await import('~/server/api/campaigns/[id].put')).default)
router.post('/api/email/repair', (await import('~/server/api/email/repair.post')).default)
const handle = h3.toWebHandler(h3.createApp().use(router))

async function request(path: string, body?: unknown, method = 'POST') {
  const res = await handle(new Request(`http://localhost${path}`, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  }))
  return { status: res.status, json: await res.json().catch(() => null) as any }
}

const row = (id: number) => sqlite.prepare('SELECT subject, preheader, template_html AS html FROM campaigns WHERE id = ?').get(id) as { subject: string; preheader: string | null; html: string }

// The email as the AI assistant produced it in the reported campaign: a card
// image with a double-escaped alt, the same module twice, the library's
// "haz clic aquí" footer and a personalised subject without fallback.
const card = (src: string) => `<div class="grid-block editable-block email-block" data-type="Grid" style="padding:20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;"><tr>
    <td width="48%" valign="top"><div style="border:1px solid #e2e8f0;padding:12px;">
      <div data-toggle="image"><img class="grid-img" src="${src}" alt="WOMI: Photo &amp;amp; Video IA" style="display:block;width:100%;height:200px;object-fit:cover;"></div>
      <div data-toggle="title">WOMI: Photo &amp; Video IA en tiempo real</div>
    </div></td><td width="4%">&nbsp;</td><td width="48%" valign="top"><div data-toggle="title">AR/VR</div></td>
  </tr></table></div>`
const html = (src: string) => `<!DOCTYPE html><html lang="es"><head></head><body><div class="main-card" style="max-width:820px;">
${card(src)}
<div class="cta-block editable-block email-block" data-type="CTA"><a href="https://ejemplo.es/digital-life" class="email-button">Más información</a></div>
<div class="text-block editable-block email-block" data-type="Texto"><div data-toggle="title">Webapps y microsites al ritmo del evento</div></div>
<div class="text-block editable-block email-block" data-type="Texto"><div data-toggle="title">Webapps y microsites al ritmo del evento</div></div>
<div class="cta-block editable-block email-block" data-type="CTA"><a href="https://ejemplo.es/digital-life" class="email-button">Más información</a></div>
<div class="unsubscribe-block editable-block email-block" data-type="Unsuscribir"><div data-toggle="subtitle">
  Si no deseas recibir más comunicaciones,
  <a href="{{UNSUBSCRIBE_URL}}">haz clic aquí para darte de baja</a>.
</div></div></div></body></html>`

async function campaign(status = 'draft') {
  const uploads = join(env.dir, 'uploads')
  mkdirSync(uploads, { recursive: true })
  writeFileSync(join(uploads, 'womi.webp'), await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#224466' } }).webp().toBuffer())
  return Number(sqlite.prepare(`INSERT INTO campaigns (name, subject, preheader, template_html, status) VALUES (?, ?, ?, ?, ?)`)
    .run('Eventos', '{{Empresa}}, ¿qué experiencia hará que tu evento se recuerde?', 'Tecnología para ferias', html('/uploads/womi.webp'), status).lastInsertRowid)
}

beforeEach(() => { sqlite.exec('DELETE FROM campaigns;') })
afterAll(() => sqlite.close())

describe('campaign repair', () => {
  it('repairs the stored template, is a no-op the second time and can be undone', async () => {
    const id = await campaign()
    const original = row(id).html
    const first = await request(`/api/campaigns/${id}/repair`)
    expect(first.status).toBe(200)
    expect(first.json.changes.map((c: any) => c.id).sort())
      .toEqual(['alt_text', 'duplicate_blocks', 'image_crop', 'image_size', 'unsubscribe_text', 'webp'])
    expect(first.json.previous).toEqual({ templateHtml: original })

    const repaired = row(id).html
    expect(repaired.match(/Webapps y microsites/g)).toHaveLength(1)
    expect(repaired).not.toContain('.webp')
    expect(repaired).toContain('alt="WOMI: Photo &amp; Video IA"')
    expect(repaired).toMatch(/<img class="grid-img" src="\/uploads\/mail_\d+-womi-\d+x200\.jpg"[^>]* width="\d+" height="200">/)
    expect(repaired).toContain('comunicaciones, puedes <a href="{{UNSUBSCRIBE_URL}}">darte de baja de esta lista</a>.')

    const second = await request(`/api/campaigns/${id}/repair`)
    expect(second.json).toEqual({ changes: [], previous: null })

    expect((await request(`/api/campaigns/${id}`, first.json.previous, 'PUT')).status).toBe(200)
    expect(row(id).html).toBe(original)
  })

  it('refuses campaigns that are no longer editable', async () => {
    const id = await campaign('sent')
    expect((await request(`/api/campaigns/${id}/repair`)).status).toBe(409)
    expect((await request(`/api/campaigns/${id}/apply-edits`, { edits: [{ target: 'subject', find: 'x', replace: 'y' }] })).status).toBe(409)
  })

  it('applies the AI review corrections that match and reports the rest', async () => {
    const id = await campaign()
    const res = await request(`/api/campaigns/${id}/apply-edits`, {
      edits: [
        { target: 'subject', find: '{{Empresa}}, ¿qué', replace: '{{Empresa | "Tu equipo"}}, ¿qué', occurrence: 0 },
        { target: 'body', find: 'Más información', replace: 'Ver casos de ferias y sector público', occurrence: 2 },
        { target: 'body', find: 'texto que no existe', replace: 'x', occurrence: 0 },
        { target: 'preheader', find: 'ferias', replace: 'ferias y eventos', occurrence: 0 },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.json.applied).toEqual([0, 1, 3])
    expect(res.json.failed).toEqual([2])
    const c = row(id)
    expect(c.subject).toBe('{{Empresa | "Tu equipo"}}, ¿qué experiencia hará que tu evento se recuerde?')
    expect(c.preheader).toBe('Tecnología para ferias y eventos')
    expect(c.html.match(/>Más información</g)).toHaveLength(1)
    expect(c.html).toContain('class="email-button">Ver casos de ferias y sector público</a>')
    expect(res.json.previous.subject).toBe('{{Empresa}}, ¿qué experiencia hará que tu evento se recuerde?')
  })

  it('repairs unsaved HTML for the AI assistants', async () => {
    await campaign()
    const res = await request('/api/email/repair', { html: html('/uploads/womi.webp') })
    expect(res.status).toBe(200)
    expect(res.json.html).not.toContain('.webp')
    expect(res.json.changes.length).toBeGreaterThan(0)
    expect((await request('/api/email/repair', { html: '' })).status).toBe(400)
  })
})
