import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editorBlocks } from '~/utils/editorBlocks'
import { EDITOR_AI_CATALOG } from '~/utils/editorAiBlocks'
import { emptyAssistantBrief, emptyAssistantSignature } from '~/utils/editorAssistant'
import type { EditorAssistantBrief } from '~/utils/editorAssistant'

const mock = vi.hoisted(() => ({ aiJson: vi.fn(), getBrandKit: vi.fn(), brandBrief: vi.fn(), gatherPageContext: vi.fn() }))
vi.mock('~/server/utils/ai/provider', () => ({
  aiJson: mock.aiJson,
  AiError: class AiError extends Error {
    constructor(message: string, public code: string) { super(message); this.name = 'AiError' }
  },
}))
vi.mock('~/server/utils/ai/brand-kit', () => ({ getBrandKit: mock.getBrandKit, brandBrief: mock.brandBrief }))
vi.mock('~/server/utils/ai/campaign-gen', () => ({ gatherPageContext: mock.gatherPageContext }))

const { EDITOR_ASSISTANT_SCHEMA, parseEditorAssistantBrief, generateEditorAssistant } = await import('~/server/utils/ai/editor-assistant')

const FIELD_KEYS = ['badge', 'title', 'subtitle', 'button', 'buttonUrl', 'images', 'logo', 'price', 'code', 'contact', 'ps', 'features', 'socialUrls', 'videoUrl']
const primaryUrl = 'https://marca.es/coleccion'
const approvedImage = 'https://marca.es/producto.jpg'

function brief(patch: Partial<EditorAssistantBrief> = {}): EditorAssistantBrief {
  return {
    ...emptyAssistantBrief(), campaign: 'Presentar la colección otoño', objective: 'Conseguir visitas al catálogo',
    audience: 'Clientes que buscan piezas de diseño', ctaUrl: primaryUrl, ctaText: 'Ver la colección',
    includeSignature: false, ...patch,
  }
}

function block(id: string, patch: Record<string, string[]> = {}) {
  const slots = EDITOR_AI_CATALOG.find(item => item.id === id)?.slots ?? {}
  const fields = Object.fromEntries(FIELD_KEYS.map(key => [key,
    ['title', 'subtitle', 'badge', 'button'].includes(key)
      ? Array.from({ length: slots[key] ?? 0 }, (_, i) => `${key === 'title' ? 'Diseño para disfrutar' : 'Descubre piezas elegidas para tu espacio'} ${i + 1}`)
      : [],
  ]))
  return { id, fields: { ...fields, ...patch } }
}

function plan(blocks = [block('hero'), block('text'), block('button'), block('unsubscribe')]) {
  return {
    name: 'Colección otoño', subject: 'Diseño que transforma tu espacio',
    preheader: 'Descubre las piezas de la nueva colección para tu hogar.',
    rationale: 'Una portada clara presenta la colección. El contenido explica su utilidad y conduce al catálogo.', blocks,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.aiJson.mockReset().mockImplementation(async () => plan())
  mock.getBrandKit.mockReturnValue({ name: 'Marca real', website: 'https://marca.es/', logoUrl: '/uploads/marca.png' })
  mock.brandBrief.mockReturnValue('MARCA: Marca real')
  mock.gatherPageContext.mockReset().mockResolvedValue({ title: 'Colección real', text: 'Piezas de diseño para tu hogar.', images: [approvedImage] })
})

describe('editor assistant brief validation', () => {
  it.each([null, undefined, [], {}, { campaign: 'Una campaña' }, { campaign: 'Una campaña', objective: 'Vender' }])(
    'requires a campaign, objective and audience before calling a provider (%j)', async (input) => {
      await expect(generateEditorAssistant({ brief: input })).rejects.toMatchObject({ statusCode: 400 })
      expect(mock.aiJson).not.toHaveBeenCalled()
      expect(mock.gatherPageContext).not.toHaveBeenCalled()
    },
  )

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@marca.es/', 'no es una URL'])('rejects invalid primary URLs (%s)', (ctaUrl) => {
    expect(() => parseEditorAssistantBrief(brief({ ctaUrl }))).toThrow(/http o https/)
  })

  it('normalizes and bounds the approved brief and signature without inventing missing fields', () => {
    const parsed = parseEditorAssistantBrief(brief({
      campaign: `  ${'c'.repeat(3500)}  `, objective: '  Visitas  ', audience: '  Clientes  ',
      styleId: 'unknown-style', language: 'unknown-language', ctaUrl: 'https://MARCA.es', includeSignature: true,
      signature: { ...emptyAssistantSignature(), name: '  María  ', details: 'd'.repeat(800), email: 'maria@marca.es',
        website: 'www.marca.es', imageUrl: '/uploads/firma.png', ps: 'p'.repeat(1200) },
    }))
    expect(parsed).toMatchObject({ objective: 'Visitas', audience: 'Clientes', ctaUrl: 'https://marca.es/', styleId: 'default', language: 'es' })
    expect(parsed.campaign).toHaveLength(3000)
    expect(parsed.signature).toMatchObject({ name: 'María', email: 'maria@marca.es', website: 'https://www.marca.es/', phone: '', imageUrl: '/uploads/firma.png' })
    expect(parsed.signature?.details).toHaveLength(600)
    expect(parsed.signature?.ps).toHaveLength(1000)
  })

  it.each(['invalid', 'Name <persona@marca.es>', 'a b@marca.es', 'https://persona@marca.es'])('rejects invalid signature email (%s)', (email) => {
    expect(() => parseEditorAssistantBrief(brief({ includeSignature: true, signature: { ...emptyAssistantSignature(), name: 'Ana', email } })))
      .toThrow(/email de la firma/)
  })

  it('discards unsafe signature assets and websites, including encoded upload traversal', () => {
    const parsed = parseEditorAssistantBrief(brief({ includeSignature: true, signature: {
      ...emptyAssistantSignature(), name: 'Ana', website: 'javascript:alert(1)', imageUrl: '/uploads/%2e%2e/private.png',
    } }))
    expect(parsed.signature).toMatchObject({ name: 'Ana', website: '', imageUrl: '' })
  })

  it('removes a signature explicitly disabled by the operator', () => {
    expect(parseEditorAssistantBrief(brief({ includeSignature: false, signature: { ...emptyAssistantSignature(), name: 'Ana' } })).signature).toBeNull()
  })
})

describe('native editor assistant generation', () => {
  it('uses the real editor module catalogue in the schema and prompt, preserving the chosen style', async () => {
    mock.aiJson.mockResolvedValue({ ...plan(), styleId: 'tech-noir' })
    const output = await generateEditorAssistant({ brief: brief({ styleId: 'corporate', useBrandKit: false }) })
    expect(EDITOR_ASSISTANT_SCHEMA.properties.blocks.items.properties.id.enum).toEqual(editorBlocks.map(item => item.id))
    const request = mock.aiJson.mock.calls[0][0]
    expect(request.schema).toBe(EDITOR_ASSISTANT_SCHEMA)
    expect(request.system).toContain(JSON.stringify(EDITOR_AI_CATALOG))
    expect(request.system).toContain('Estilo seleccionado: corporate')
    expect(request).toMatchObject({ feature: 'editor_assistant', effort: 'high' })
    expect(output).toMatchObject({ type: 'template', styleId: 'corporate', subject: 'Diseño que transforma tu espacio' })
    expect(mock.getBrandKit).not.toHaveBeenCalled()
    expect(output.blocks.at(-1)?.id).toBe('unsubscribe')
  })

  it('repairs an incomplete grid once and returns every corrected native slot', async () => {
    mock.aiJson
      .mockResolvedValueOnce(plan([block('hero'), block('grid-2', { title: ['Solo una tarjeta'] }), block('unsubscribe')]))
      .mockResolvedValueOnce(plan([block('hero'), block('grid-2', { title: ['Diseño natural', 'Acabados cuidados'], subtitle: ['Para tu salón.', 'Para todos los días.'] }), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(mock.aiJson.mock.calls[1][0].messages.at(-1).content).toMatch(/grid-2.*2 campos title/)
    expect(output.blocks.find(item => item.id === 'grid-2')?.fields).toMatchObject({
      title: ['Diseño natural', 'Acabados cuidados'], subtitle: ['Para tu salón.', 'Para todos los días.'],
    })
  })

  it('rejects a still-incomplete design after exactly two attempts', async () => {
    mock.aiJson.mockImplementation(async () => plan([block('hero'), block('grid-3', { title: ['Una sola tarjeta'] }), block('unsubscribe')]))
    await expect(generateEditorAssistant({ brief: brief() })).rejects.toMatchObject({ code: 'invalid_output' })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
  })

  it('repairs a proposal whose only content module disappears when unverified video assets are filtered', async () => {
    mock.aiJson
      .mockResolvedValueOnce(plan([
        block('header-pro'),
        block('video', { subtitle: ['Descubre cómo combinar las piezas de la colección.'], images: ['https://invented.es/thumbnail.jpg'], videoUrl: [primaryUrl] }),
        block('unsubscribe'),
      ]))
      .mockResolvedValueOnce(plan([
        block('header-pro'), block('text', { title: ['Piezas versátiles que acompañan tu día a día.'] }), block('unsubscribe'),
      ]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(output.blocks.map(item => item.id)).toEqual(['header-pro', 'text', 'unsubscribe'])
    expect(output.blocks.find(item => item.id === 'text')?.fields.title).toBe('Piezas versátiles que acompañan tu día a día.')
    expect(JSON.stringify(output.blocks)).not.toContain('invented.es')
  })

  it('fails after two attempts when video filtering would leave only a header and footer', async () => {
    mock.aiJson.mockImplementation(async () => plan([
      block('header-pro'),
      block('video', { subtitle: ['Descubre cómo combinar las piezas de la colección.'], images: ['https://invented.es/thumbnail.jpg'], videoUrl: [primaryUrl] }),
      block('unsubscribe'),
    ]))
    await expect(generateEditorAssistant({ brief: brief() })).rejects.toMatchObject({ code: 'invalid_output' })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
  })

  it.each(['<b></b>', '&nbsp;'])('repairs a required title containing no visible text (%s)', async (emptyTitle) => {
    mock.aiJson
      .mockResolvedValueOnce(plan([block('header-pro'), block('text', { title: [emptyTitle] }), block('unsubscribe')]))
      .mockResolvedValueOnce(plan([block('header-pro'), block('text', { title: ['Diseño que se adapta a tu espacio.'] }), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(output.blocks.find(item => item.id === 'text')?.fields.title).toBe('Diseño que se adapta a tu espacio.')
  })

  it('rejects model-invented modules instead of silently accepting a partial proposal', async () => {
    mock.aiJson.mockImplementation(async () => plan([block('hero'), block('invented-countdown'), block('unsubscribe')]))
    await expect(generateEditorAssistant({ brief: brief() })).rejects.toMatchObject({ code: 'invalid_output', message: expect.stringContaining('invented-countdown') })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
  })

  it('reapplies exactly the approved signature before the footer, discarding model identity and duplicate signatures', async () => {
    const approved = { name: 'Ana García', details: 'Directora · Marca', email: 'ana@marca.es', website: 'https://marca.es/',
      phone: '+34 611 222 333', imageUrl: '/uploads/ana.png', ps: 'Te acompaño en tu elección.' }
    mock.aiJson.mockResolvedValue(plan([block('hero'), block('text'),
      block('signature', { title: ['Invented Person'], contact: ['invented@another.es'], images: ['https://another.es/person.png'] }),
      block('unsubscribe'), block('signature', { title: ['Other Person'] }),
    ]))
    const output = await generateEditorAssistant({ brief: brief({ includeSignature: true, signature: approved }) })
    expect(output.blocks.slice(-2).map(item => item.id)).toEqual(['signature', 'unsubscribe'])
    expect(output.blocks.filter(item => item.id === 'signature')).toEqual([{
      id: 'signature', fields: { title: approved.name, subtitle: approved.details, contact: [approved.email, approved.website, approved.phone], images: approved.imageUrl, ps: approved.ps },
    }])
    expect(JSON.stringify(output)).not.toMatch(/Invented Person|Other Person|another\.es/)
  })

  it('pins CTAs, permitted images and the brand logo while preserving positional image slots', async () => {
    const secondaryUrl = 'https://marca.es/contacto'
    mock.aiJson.mockResolvedValue(plan([
      block('header-pro', { logo: ['https://invented.es/logo.png'] }),
      block('hero', { buttonUrl: ['https://invented.es/buy'], button: ['Model wording'] }),
      block('image', { images: [approvedImage] }),
      block('grid-2', { images: ['https://invented.es/photo.jpg', approvedImage] }),
      block('button', { buttonUrl: [secondaryUrl] }), block('unsubscribe'),
    ]))
    const output = await generateEditorAssistant({ brief: brief({ offer: `Puedes contactarnos también en ${secondaryUrl}.` }) })
    expect(output.blocks.find(item => item.id === 'header-pro')?.fields.logo).toBe('/uploads/marca.png')
    expect(output.blocks.find(item => item.id === 'hero')?.fields).toMatchObject({ buttonUrl: primaryUrl, button: 'Ver la colección' })
    expect(output.blocks.find(item => item.id === 'image')?.fields.images).toBe(approvedImage)
    expect(output.blocks.find(item => item.id === 'grid-2')?.fields.images).toEqual(['', approvedImage])
    expect(output.blocks.find(item => item.id === 'button')?.fields.buttonUrl).toBe(secondaryUrl)
    expect(JSON.stringify(output.blocks)).not.toContain('invented.es')
    expect(output.warnings.join(' ')).toMatch(/enlaces/i)
    expect(mock.gatherPageContext).toHaveBeenCalledExactlyOnceWith(primaryUrl)
  })

  it('reports missing links and discarded visual assets while producing a usable draft', async () => {
    mock.aiJson.mockResolvedValue(plan([block('hero', { buttonUrl: ['https://invented.es/buy'] }), block('image', { images: ['https://invented.es/missing.jpg'] }), block('text'), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief({ ctaUrl: '', includeSignature: true, signature: null, useBrandKit: false }) })
    expect(output.blocks.find(item => item.id === 'hero')?.fields.buttonUrl).toBe('')
    expect(output.blocks.some(item => item.id === 'image')).toBe(false)
    expect(output.blocks.some(item => item.id === 'signature')).toBe(false)
    expect(output.warnings.join(' ')).toMatch(/enlace principal/i)
    expect(output.warnings.join(' ')).toMatch(/firma/i)
    expect(output.warnings.join(' ')).toMatch(/im[aá]genes|imagen|visual/i)
    expect(mock.gatherPageContext).not.toHaveBeenCalled()
  })

  it('preserves emphasis but removes model-proposed inline links, attributes and executable content', async () => {
    mock.aiJson.mockResolvedValue(plan([
      block('hero'),
      block('text', { title: ['<b onclick="alert(1)">Diseño &amp; confort</b><br><a href="https://invented.es">Descubre más</a><script>steal()</script><img src="https://invented.es/track">'] }),
      block('unsubscribe'),
    ]))
    const output = await generateEditorAssistant({ brief: brief() })
    const copy = output.blocks.find(item => item.id === 'text')?.fields.title
    expect(copy).toBe('<b>Diseño &amp; confort</b><br>Descubre más')
    expect(JSON.stringify(output.blocks)).not.toMatch(/invented\.es|onclick|steal\(\)|<script|<img/)
  })

  it('can generate from the approved brief when the linked site cannot be read', async () => {
    mock.gatherPageContext.mockRejectedValue(new Error('Site unavailable'))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(output.type).toBe('template')
    expect(output.warnings.join(' ')).toMatch(/No se pudo leer la página/)
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('bounds and normalizes prior drafts for refinements and never forwards arbitrary previous fields', async () => {
    const output = await generateEditorAssistant({
      brief: brief(), instruction: `Hazlo más directo. ${'r'.repeat(3000)}`,
      previous: { name: 'n'.repeat(500), subject: 's'.repeat(500), preheader: 'p'.repeat(500), secretMetadata: 'not-forwarded',
        blocks: Array.from({ length: 60 }, () => ({ id: 'text', fields: { title: ['t'.repeat(15000)], unexpected: ['not-forwarded'] } })),
      },
    })
    const request = JSON.parse(mock.aiJson.mock.calls[0][0].messages[0].content)
    expect(request.requestedRevision).toHaveLength(2500)
    expect(request.previous.name).toHaveLength(100)
    expect(request.previous.subject).toHaveLength(150)
    expect(request.previous.preheader).toHaveLength(250)
    expect(request.previous.blocks.length).toBeLessThanOrEqual(17)
    expect(request.previous.blocks.filter((item: any) => item.id === 'text')).toHaveLength(16)
    expect(request.previous.blocks[0].fields.title).toHaveLength(12000)
    expect(JSON.stringify(request)).not.toContain('not-forwarded')
    expect(output.text).toMatch(/revisión/i)
  })
})
