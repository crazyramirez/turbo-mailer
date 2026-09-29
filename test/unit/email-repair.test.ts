import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { lintEmailHtml } from '~/server/utils/email-lint'
import { finalizeEmailHtml } from '~/server/utils/email-compile'

// Uploads resolve against DATA_DIR at import time: point it at a scratch dir first
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-repair-'))
process.env.DATA_DIR = dataDir
const { repairEmailHtml, replaceInHtml, replaceInText } = await import('~/server/utils/email-repair')
const uploads = path.join(dataDir, 'uploads')

async function upload(name: string, width: number, height: number, format: 'jpeg' | 'png' | 'webp', alpha = false) {
  fs.mkdirSync(uploads, { recursive: true })
  const img = sharp({ create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 10, g: 20, b: 30, alpha: 0.5 } : '#336699' } })
  fs.writeFileSync(path.join(uploads, name), await img.toFormat(format).toBuffer())
  return `/uploads/${name}`
}

const shell = (body: string, lang = 'es') =>
  `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"></head><body><div class="main-card" style="width:100%;max-width:820px;margin:0 auto;">${body}</div></body></html>`

const grid = (src: string) => `<div class="grid-block editable-block email-block" data-type="Grid" style="padding:20px;background:#f6faff;">
  <table class="email-layout-table" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;"><tr>
    <td width="48%" valign="top"><div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
      <div data-toggle="image"><img class="grid-img" src="${src}" alt="WOMI: Photo &amp;amp; Video" style="max-width:100%;display:block;width:100%;height:200px;object-fit:cover;"></div>
      <div data-toggle="title">WOMI: Photo &amp; Video</div>
    </div></td>
    <td width="4%">&nbsp;</td>
    <td width="48%" valign="top"><div data-toggle="title">Otro</div></td>
  </tr></table>
</div>`

beforeAll(() => fs.mkdirSync(uploads, { recursive: true }))
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }))

describe('repairEmailHtml', () => {
  it('removes a module repeated back-to-back but keeps spacers and distinct modules', async () => {
    const block = '<div class="text-block editable-block email-block" data-type="Texto" style="padding:20px"><div data-toggle="title">AR/VR: pon al cliente dentro</div></div>'
    const spacer = '<div class="spacer-block editable-block email-block" data-type="Espaciador" style="height:20px"></div>'
    const { html, changes } = await repairEmailHtml(shell(`${block}\n  ${block}${spacer}${spacer}<div class="editable-block" data-type="Texto">Otro</div>`), { images: false })
    expect(html.match(/AR\/VR/g)).toHaveLength(1)
    expect(html.match(/spacer-block/g)).toHaveLength(2)
    expect(changes).toEqual([{ id: 'duplicate_blocks', count: 1 }])
  })

  it('decodes alt text escaped twice and rewrites a vague unsubscribe link', async () => {
    const footer = `<div class="unsubscribe-block editable-block email-block" data-type="Unsuscribir"><div data-toggle="subtitle">
      Has recibido este email porque te suscribiste a nuestra lista.<br>
      Si no deseas recibir más comunicaciones,
      <a href="{{UNSUBSCRIBE_URL}}" style="color:#4f46e5;text-decoration:underline;">haz clic aquí para darte de baja</a>.
    </div></div>`
    const { html, changes } = await repairEmailHtml(shell(`<img src="https://cdn.example.com/a.jpg" alt="Gamificación &amp;amp; dinámicas">${footer}`), { images: false })
    expect(html).toContain('alt="Gamificación &amp; dinámicas"')
    expect(html).toMatch(/comunicaciones, puedes <a href="\{\{UNSUBSCRIBE_URL\}\}" style="color:#4f46e5;text-decoration:underline;">darte de baja de esta lista<\/a>\./)
    expect(changes.map(c => c.id).sort()).toEqual(['alt_text', 'unsubscribe_text'])
    // Second pass: nothing left to do, identical bytes
    const again = await repairEmailHtml(html, { images: false })
    expect(again.changes).toEqual([])
    expect(again.html).toBe(html)
  })

  it('crops fixed-height cover images to their box and sizes them for Outlook', async () => {
    const src = await upload('foto.jpg', 1200, 800, 'jpeg')
    const input = shell(grid(src))
    expect(lintEmailHtml(finalizeEmailHtml(input)).map(i => i.id)).toContain('object_fit')
    const { html, changes } = await repairEmailHtml(input)
    expect(changes.map(c => c.id).sort()).toEqual(['alt_text', 'image_crop', 'image_size'])
    const tag = html.match(/<img class="grid-img"[^>]*>/)![0]
    // 800 Outlook width − 40 block padding → 760 × 48% − 24 padding − 2 border ≈ 339
    expect(tag).toMatch(/width="339"/)
    expect(tag).toMatch(/height="200"/)
    const newSrc = tag.match(/src="([^"]+)"/)![1]
    expect(newSrc).toMatch(/^\/uploads\/mail_\d+-foto-339x200\.jpg$/)
    const meta = await sharp(path.join(uploads, newSrc.slice('/uploads/'.length))).metadata()
    expect(Math.abs(meta.width! / meta.height! - 339 / 200)).toBeLessThan(0.02)
    expect(lintEmailHtml(finalizeEmailHtml(html)).map(i => i.id)).not.toContain('object_fit')
    // Idempotent: the cropped file already has the box's aspect
    expect((await repairEmailHtml(html)).changes).toEqual([])
  })

  it('converts WebP to JPEG, or PNG when it has transparency', async () => {
    const photo = await upload('photo.webp', 600, 400, 'webp')
    const logo = await upload('logo.webp', 400, 120, 'webp', true)
    const { html, changes } = await repairEmailHtml(shell(
      `<div style="padding:32px"><div data-toggle="logo"><img src="${logo}" alt="Logo" style="max-width:100%;display:block;max-height:50px;width:auto;"></div>`
      + `<img src="${photo}" alt="" style="width:100%;height:auto"></div>`,
    ))
    expect(changes.find(c => c.id === 'webp')?.count).toBe(2)
    expect(html).not.toMatch(/\.webp/)
    expect(html).toMatch(/<img src="\/uploads\/mail_\d+-logo\.png" alt="Logo" style="[^"]*" width="167" height="50">/)
    expect(html).toMatch(/<img src="\/uploads\/mail_\d+-photo\.jpg" alt="" style="width:100%;height:auto" width="736">/)
    expect(lintEmailHtml(finalizeEmailHtml(html)).map(i => i.id)).not.toContain('webp')
  })

  it('dry run reports the same changes without touching HTML or files', async () => {
    const src = await upload('dry.webp', 1200, 800, 'webp')
    const input = shell(grid(src))
    const before = fs.readdirSync(uploads).length
    const dry = await repairEmailHtml(input, { dryRun: true })
    expect(dry.html).toBe(input)
    expect(fs.readdirSync(uploads).length).toBe(before)
    expect(dry.changes.map(c => c.id).sort()).toEqual(['alt_text', 'image_crop', 'image_size', 'webp'])
    const real = await repairEmailHtml(input)
    expect(real.changes.map(c => c.id).sort()).toEqual(dry.changes.map(c => c.id).sort())
  })

  it('keeps an existing width attribute that already matches the layout', async () => {
    const html = shell('<img src="https://cdn.example.com/x.jpg" width="800" style="width:100%;height:auto" alt="x">')
    expect((await repairEmailHtml(html)).changes).toEqual([])
  })
})

describe('AI review text edits', () => {
  const body = shell(`<p>Descubre <b>WOMI</b></p>
    <a href="https://x.com/a" class="email-button">Más información</a>
    <p>Texto con   espacios
      y salto &amp; más</p>
    <a href="https://x.com/a" class="email-button">Más información</a>`)

  it('replaces only the requested occurrence in visible text', () => {
    const { html, hits } = replaceInHtml(body, { target: 'body', find: 'Más información', replace: 'Ver casos de ferias', occurrence: 2 })
    expect(hits).toBe(1)
    expect(html).toContain('<a href="https://x.com/a" class="email-button">Más información</a>')
    expect(html).toContain('<a href="https://x.com/a" class="email-button">Ver casos de ferias</a>')
  })

  it('tolerates whitespace differences and re-escapes the new text', () => {
    const { html, hits } = replaceInHtml(body, { target: 'body', find: 'espacios y salto & más', replace: 'espacios & <menos>' })
    expect(hits).toBe(1)
    expect(html).toContain('Texto con   espacios &amp; &lt;menos&gt;</p>')
  })

  it('does not match text split across tags or inside attributes', () => {
    expect(replaceInHtml(body, { target: 'body', find: 'Descubre WOMI', replace: 'x' }).hits).toBe(0)
    expect(replaceInHtml(body, { target: 'body', find: 'x.com', replace: 'y' }).hits).toBe(0)
  })

  it('keeps the hidden preheader and the body apart', () => {
    const html = shell('<div data-email-preheader="true" style="display:none">Oferta hoy</div><p>Oferta hoy</p>')
    const pre = replaceInHtml(html, { target: 'preheader', find: 'Oferta hoy', replace: 'Solo hoy' })
    expect(pre.hits).toBe(1)
    expect(pre.html).toContain('style="display:none">Solo hoy</div><p>Oferta hoy</p>')
  })

  it('edits plain fields like the subject', () => {
    expect(replaceInText('{{Empresa}}, ¿qué experiencia?', { find: '{{Empresa}}, ¿qué', replace: '{{Empresa | "Tu equipo"}}, ¿qué' }))
      .toEqual({ text: '{{Empresa | "Tu equipo"}}, ¿qué experiencia?', hits: 1 })
    expect(replaceInText('abc', { find: '   ', replace: 'x' }).hits).toBe(0)
  })
})
