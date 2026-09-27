import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readdirSync, unlinkSync, utimesSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import * as h3 from 'h3'

const env = await vi.hoisted(async () => {
  const { bootIsolatedEnv } = await import('./harness')
  return bootIsolatedEnv({ companyAddress: 'Calle Mayor 12', smtpPass: 'never-return-this-secret' })
})

const { sqlite } = await import('~/server/db/index')
const { getEditorAssistantContext, extractEditorSignatures } = await import('~/server/utils/ai/editor-context')
const { templatesDir } = await import('~/server/utils/template-files')
const endpoint = (await import('~/server/api/ai/editor-context.get')).default
const handle = h3.toWebHandler(h3.createApp().use('/api/ai/editor-context', endpoint))

function signature(input: { name?: string; details?: string; email?: string; website?: string; phone?: string; image?: string; ps?: string } = {}) {
  return `<div class="signature-block" data-type="Firma"><table><tr>
    <td><div data-toggle="image"><img src="${input.image ?? ''}"></div></td>
    <td><div data-toggle="title">${input.name ?? ''}</div>
    <div data-toggle="subtitle">${input.details ?? ''}</div>
    <div data-toggle="contact"><a href="mailto:${input.email ?? ''}">${input.email ?? ''}</a></div>
    <div data-toggle="contact"><a href="${input.website ?? ''}">${input.website ?? ''}</a></div>
    <div data-toggle="contact"><a href="tel:${input.phone ?? ''}">${input.phone ?? ''}</a></div></td>
    </tr></table><div data-toggle="ps"><b>P.D.</b> ${input.ps ?? ''}</div></div>`
}

function campaign(name: string, html: string | null, created = 1000, template: string | null = null, kind = 'regular') {
  return Number(sqlite.prepare(`INSERT INTO campaigns (name, subject, template_html, template_name, created_at, kind)
    VALUES (?, ?, ?, ?, ?, ?)`).run(name, `Asunto ${name}`, html, template, created, kind).lastInsertRowid)
}

beforeEach(() => {
  sqlite.exec('DELETE FROM campaigns; DELETE FROM settings; DELETE FROM contacts;')
  mkdirSync(templatesDir, { recursive: true })
  for (const file of readdirSync(templatesDir)) unlinkSync(join(templatesDir, file))
  env.cfg.smtpFromName = 'Test Sender'
  env.cfg.smtpFromEmail = 'sender@example.com'
})

afterAll(() => sqlite.close())

describe('editor assistant context', () => {
  it('recalls a complete recent campaign signature with provenance and deduplicates saved copies', async () => {
    const html = signature({ name: 'María &amp; equipo', details: 'Dirección<br>Marca real', email: 'maria@marca.es',
      website: 'https://marca.es/', phone: '+34 611 222 333', image: '/uploads/firma.png', ps: 'Podemos ayudarte.' })
    campaign('Campaña antigua', html, 1000)
    const latest = campaign('Nueva colección', html, 2000)
    writeFileSync(join(templatesDir, 'Copia guardada.html'), html)
    const context = await getEditorAssistantContext()
    expect(context.signatures).toEqual([{
      id: `campaign:${latest}:0`, sourceType: 'campaign', sourceName: 'Nueva colección', updatedAt: 2000000,
      signature: { name: 'María & equipo', details: 'Dirección\nMarca real', email: 'maria@marca.es', website: 'https://marca.es/',
        phone: '+34 611 222 333', imageUrl: '/uploads/firma.png', ps: 'Podemos ayudarte.' },
    }])
    expect(context.recentCampaigns[0]).toEqual({ id: latest, name: 'Nueva colección', subject: 'Asunto Nueva colección' })
  })

  it('keeps different identities separate instead of filling blanks with another campaign or sender', async () => {
    campaign('Otra persona', signature({ name: 'Luis Soto', email: 'luis@empresa.es', phone: '+34 622 333 444' }), 1000)
    campaign('Firma reciente incompleta', signature({ name: 'Ana Pérez', details: 'Ventas' }), 2000)
    const { signatures } = await getEditorAssistantContext()
    expect(signatures).toHaveLength(2)
    expect(signatures[0].signature).toMatchObject({ name: 'Ana Pérez', details: 'Ventas', email: '', phone: '', website: '' })
    expect(signatures[1].signature).toMatchObject({ name: 'Luis Soto', email: 'luis@empresa.es' })
    expect(signatures.every(candidate => candidate.sourceType === 'campaign')).toBe(true)
  })

  it('ignores stock demo identity, contacts, phone, image and postscript, with only public sender fallback', async () => {
    campaign('Demo', signature({ name: 'Alex Rivera', details: 'NovaSphere Solutions', email: 'hola@tudominio.com',
      website: 'https://www.tudominio.com', phone: '+34 600 000 000', image: 'https://placehold.co/200x200',
      ps: 'Escribe aquí una nota final, recordatorio o posdata para tu destinatario.' }))
    sqlite.prepare('INSERT INTO contacts (email, name) VALUES (?, ?)').run('private-recipient@secret.es', 'Recipient Secret')
    sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('brand_kit', JSON.stringify({ name: 'Marca', website: 'https://marca.es' }))
    const response = await handle(new Request('http://localhost/api/ai/editor-context'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const context = await response.json()
    expect(context.signatures).toEqual([{
      id: 'settings:sender', sourceType: 'settings', sourceName: 'Remitente configurado', updatedAt: 0,
      signature: { name: 'Test Sender', details: 'Calle Mayor 12', email: 'sender@example.com', website: 'https://marca.es/',
        phone: '', imageUrl: '', ps: '' },
    }])
    expect(JSON.stringify(context)).not.toMatch(/never-return-this-secret|private-recipient|Recipient Secret|smtpPass|smtpUser|Alex Rivera|NovaSphere/)
  })

  it('recovers signatures from a campaign template filename and recent saved templates', async () => {
    writeFileSync(join(templatesDir, 'Plantilla campaña.html'), signature({ name: 'Silvia', email: 'silvia@marca.es' }))
    writeFileSync(join(templatesDir, 'Firma antigua.html'), signature({ name: 'Firma antigua' }))
    writeFileSync(join(templatesDir, 'Firma nueva.html'), signature({ name: 'Firma nueva' }))
    utimesSync(join(templatesDir, 'Firma antigua.html'), 1000, 1000)
    utimesSync(join(templatesDir, 'Firma nueva.html'), 2000, 2000)
    const id = campaign('Campaña por archivo', null, 3000, 'Plantilla campaña.html')
    const { signatures } = await getEditorAssistantContext()
    expect(signatures.map(candidate => candidate.sourceName)).toEqual(['Campaña por archivo', 'Firma nueva', 'Firma antigua'])
    expect(signatures[0]).toMatchObject({ id: `campaign:${id}:0`, sourceType: 'campaign', signature: { name: 'Silvia' } })
    expect(signatures[1]).toMatchObject({ sourceType: 'template', updatedAt: 2000000 })
  })

  it('extracts only visible signature fields, decodes entities and never executes embedded content', () => {
    const html = `<script>${signature({ name: 'Script identity' })}</script>
      <section DATA-TYPE=Firma><div data-toggle=title>Lucía &#x26; socios<script>globalThis.signatureExecuted=true</script></div>
      <div data-toggle=subtitle>Diseño<br>Valencia</div>
      <div data-toggle=contact><a href="mailto:old@marca.es">lucia@marca.es</a></div>
      <div data-toggle=contact style="display: none"><a href="tel:+34999999999">+34 999 999 999</a></div>
      <img src="javascript:alert(1)"><div data-toggle=ps>P.D. Hablemos.</div></section>
      <div hidden>${signature({ name: 'Hidden identity' })}</div>`
    expect(extractEditorSignatures(html)).toEqual([{
      name: 'Lucía & socios', details: 'Diseño\nValencia', email: 'lucia@marca.es', website: '', phone: '', imageUrl: '', ps: 'Hablemos.',
    }])
    expect((globalThis as any).signatureExecuted).toBeUndefined()
  })

  it('does not merge separate or nested signature blocks in the same template', () => {
    const html = `<div class=signature-block><div data-toggle=title>Outer Person</div>${signature({ name: 'Inner Person', email: 'inner@marca.es' })}</div>`
    const result = extractEditorSignatures(html)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ name: 'Outer Person', email: '' })
    expect(result[1]).toMatchObject({ name: 'Inner Person', email: 'inner@marca.es' })
  })

  it('prefers an edited visible bare domain to a stale link target', () => {
    const html = `<section data-type="Firma"><div data-toggle="title">Diego</div>
      <div data-toggle="contact"><a href="https://old-company.es">viseni.com</a></div></section>`
    expect(extractEditorSignatures(html)[0]).toMatchObject({ name: 'Diego', website: 'https://viseni.com/' })
  })

  it('bounds campaign reads and skips oversized HTML and transactional recipient content', async () => {
    campaign('Fuera del límite', signature({ name: 'Old secret' }), 1)
    for (let i = 0; i < 20; i++) campaign(`Campaña ${i}`, '<div>Sin firma</div>', 100 + i)
    campaign('Demasiado grande', ' '.repeat(1024 * 1024 + 1) + signature({ name: 'Large secret' }), 300)
    campaign('Transaccional', signature({ name: 'Recipient identity' }), 400, null, 'transactional')
    const context = await getEditorAssistantContext()
    expect(context.recentCampaigns).toHaveLength(20)
    expect(context.signatures.map(candidate => candidate.sourceType)).toEqual(['settings'])
    expect(JSON.stringify(context)).not.toMatch(/Old secret|Large secret|Recipient identity|Transaccional|Fuera del límite/)
  })

  it('rejects traversal, symlink and oversized template files', async () => {
    const outside = join(env.dir, 'private.html')
    writeFileSync(outside, signature({ name: 'Outside secret' }))
    campaign('Traversal', null, 1000, '../private')
    writeFileSync(join(templatesDir, 'oversized.html'), ' '.repeat(1024 * 1024 + 1) + signature({ name: 'Large file secret' }))
    // Windows may disallow file symlinks without Developer Mode. Traversal and size guards still run there.
    try { symlinkSync(outside, join(templatesDir, 'symlink.html'), 'file') } catch (error: any) {
      if (!['EPERM', 'EACCES'].includes(error?.code)) throw error
    }
    const { signatures } = await getEditorAssistantContext()
    expect(signatures.map(candidate => candidate.sourceType)).toEqual(['settings'])
    expect(JSON.stringify(signatures)).not.toMatch(/Outside secret|Large file secret/)
  })

  it('reads at most twenty saved templates and prefers the most recently modified', async () => {
    for (let i = 0; i < 25; i++) {
      const filename = join(templatesDir, `Firma ${i}.html`)
      writeFileSync(filename, signature({ name: `Persona ${i}` }))
      utimesSync(filename, 1000 + i, 1000 + i)
    }
    const { signatures } = await getEditorAssistantContext()
    expect(signatures).toHaveLength(20)
    expect(signatures[0].signature.name).toBe('Persona 24')
    expect(signatures.at(-1)?.signature.name).toBe('Persona 5')
  })
})
