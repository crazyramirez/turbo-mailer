import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editorBlocks } from '~/utils/editorBlocks'
import { EDITOR_AI_CATALOG } from '~/utils/editorAiBlocks'
import { AI_GRID_LAYOUT_RULE } from '~/utils/aiGridLayout'
import { emptyAssistantBrief, emptyAssistantSignature } from '~/utils/editorAssistant'
import type { EditorAssistantBrief } from '~/utils/editorAssistant'

const mock = vi.hoisted(() => ({ aiJson: vi.fn(), getBrandKit: vi.fn(), brandBrief: vi.fn(), gatherPageContext: vi.fn(), audienceContext: vi.fn(), pastPerformance: vi.fn() }))
vi.mock('~/server/utils/ai/provider', () => ({
  aiJson: mock.aiJson,
  AiError: class AiError extends Error {
    constructor(message: string, public code: string) { super(message); this.name = 'AiError' }
  },
}))
vi.mock('~/server/utils/ai/brand-kit', () => ({ getBrandKit: mock.getBrandKit, brandBrief: mock.brandBrief }))
vi.mock('~/server/utils/ai/campaign-gen', () => ({ gatherPageContext: mock.gatherPageContext, audienceContext: mock.audienceContext, pastPerformance: mock.pastPerformance }))

const { EDITOR_ASSISTANT_SCHEMA, CAMPAIGN_ASSISTANT_SCHEMA, parseEditorAssistantBrief, generateEditorAssistant } = await import('~/server/utils/ai/editor-assistant')

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
  mock.audienceContext.mockReturnValue('LISTA: Clientes de diseño — 200 contactos activos.')
  mock.pastPerformance.mockReturnValue('HISTÓRICO: Colección anterior — 4% clics.')
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
  it.each([17, 40])('preserves all %i modules in a fresh design within the editor capacity', async count => {
    const paragraphs = Array.from({ length: count - 2 }, (_, i) => `Contenido aprobado ${i + 1}`)
    mock.aiJson.mockResolvedValue(plan([
      block('hero'), ...paragraphs.map(copy => block('text', { title: [copy] })), block('unsubscribe'),
    ]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(output.blocks).toHaveLength(count)
    expect(output.blocks.filter(item => item.id === 'text').map(item => item.fields.title)).toEqual(paragraphs)
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('completes a useful two-module design with the automatic footer', async () => {
    mock.aiJson.mockResolvedValue(plan([block('hero'), block('text')]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(output.blocks.map(item => item.id)).toEqual(['hero', 'text', 'unsubscribe'])
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('keeps useful content and adds the footer after an unverified image is removed', async () => {
    mock.aiJson.mockResolvedValue(plan([
      block('hero'), block('text', { title: ['Contenido que debe conservarse.'] }),
      block('image', { images: ['https://invented.es/image.jpg'] }),
    ]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(output.blocks.map(item => item.id)).toEqual(['hero', 'text', 'unsubscribe'])
    expect(output.blocks[1]?.fields.title).toBe('Contenido que debe conservarse.')
    expect(output.warnings.join(' ')).toMatch(/omitido/)
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('repairs a draft over 40 modules without silently slicing its final content', async () => {
    const paragraphs = Array.from({ length: 39 }, (_, i) => `Contenido aprobado ${i + 1}`)
    const rejected = plan([block('hero'), ...paragraphs.map(copy => block('text', { title: [copy] })), block('unsubscribe')])
    const corrected = plan([
      block('hero'), ...paragraphs.slice(0, -2).map(copy => block('text', { title: [copy] })),
      block('text', { title: [paragraphs.slice(-2).join(' ')] }), block('unsubscribe'),
    ])
    mock.aiJson.mockResolvedValueOnce(rejected).mockResolvedValueOnce(corrected)
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(output.blocks).toHaveLength(40)
    expect(output.blocks.filter(item => item.id === 'text').map(item => item.fields.title).join(' ')).toBe(paragraphs.join(' '))
    expect(mock.aiJson.mock.calls[1][0].messages.at(-1).content).toMatch(/40 módulos/)
  })

  it('rejects an unrepaired draft above 40 modules instead of returning a truncated campaign', async () => {
    mock.aiJson.mockResolvedValue(plan([block('hero'), ...Array.from({ length: 39 }, () => block('text')), block('unsubscribe')]))
    await expect(generateEditorAssistant({ brief: brief() })).rejects.toMatchObject({ code: 'invalid_output' })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
  })

  it.each([
    { count: 40, footer: false, signature: false },
    { count: 40, footer: true, signature: true },
    { count: 39, footer: false, signature: true },
  ])('repairs capacity overflow introduced by the controlled footer or signature (%j)', async ({ count, footer, signature }) => {
    const paragraphs = Array.from({ length: count - 1 - Number(footer) }, (_, i) => `Detalle aprobado ${i + 1}`)
    const rejected = plan([
      block('hero'), ...paragraphs.map(copy => block('text', { title: [copy] })), ...(footer ? [block('unsubscribe')] : []),
    ])
    const corrected = plan([
      block('hero'), ...paragraphs.slice(0, -2).map(copy => block('text', { title: [copy] })),
      block('text', { title: [paragraphs.slice(-2).join(' ')] }), ...(footer ? [block('unsubscribe')] : []),
    ])
    mock.aiJson.mockResolvedValueOnce(rejected).mockResolvedValueOnce(corrected)
    const output = await generateEditorAssistant({ brief: brief({ includeSignature: signature,
      signature: signature ? { ...emptyAssistantSignature(), name: 'Ana García' } : null,
    }) })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(output.blocks).toHaveLength(40)
    expect(output.blocks.filter(item => item.id === 'text').map(item => item.fields.title).join(' ')).toBe(paragraphs.join(' '))
    expect(output.blocks.filter(item => item.id === 'signature')).toHaveLength(Number(signature))
    expect(output.blocks.at(-1)?.id).toBe('unsubscribe')
    expect(mock.aiJson.mock.calls[1][0].messages.at(-1).content).toMatch(/40 módulos/)
  })

  it('allows a refinement to add modules beyond the previous draft length', async () => {
    const paragraphs = Array.from({ length: 18 }, (_, i) => `Apartado aprobado ${i + 1}`)
    const previous = plan([block('hero'), ...paragraphs.slice(0, 15).map(copy => block('text', { title: [copy] })), block('unsubscribe')])
    mock.aiJson.mockResolvedValue(plan([block('hero'), ...paragraphs.map(copy => block('text', { title: [copy] })), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief(), previous, instruction: 'Añade los otros tres apartados indicados.' })
    expect(output.blocks).toHaveLength(20)
    expect(output.blocks.filter(item => item.id === 'text').map(item => item.fields.title)).toEqual(paragraphs)
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('includes the rejected JSON draft in the repair conversation', async () => {
    const rejected = plan([block('hero'), block('grid-2', { title: ['Tarjeta que necesita una compañera'] }), block('unsubscribe')])
    const snapshot = JSON.parse(JSON.stringify(rejected))
    mock.aiJson.mockResolvedValueOnce(rejected).mockResolvedValueOnce(plan())
    await generateEditorAssistant({ brief: brief() })
    const messages = mock.aiJson.mock.calls[1][0].messages
    const response = messages.find((message: any) => message.role === 'assistant')
    expect(response).toBeDefined()
    expect(JSON.parse(response.content)).toEqual(snapshot)
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: expect.stringMatching(/grid-2.*2 campos title/) })
  })

  it('uses the real editor module catalogue in the schema and prompt, preserving the chosen style', async () => {
    mock.aiJson.mockResolvedValue({ ...plan(), styleId: 'tech-noir' })
    const output = await generateEditorAssistant({ brief: brief({ styleId: 'corporate', useBrandKit: false }) })
    expect(EDITOR_ASSISTANT_SCHEMA.properties.blocks.items.properties.id.enum).toEqual(editorBlocks.map(item => item.id).filter(id => !['grid-3', 'grid-4'].includes(id)))
    const request = mock.aiJson.mock.calls[0][0]
    expect(request.schema).toBe(EDITOR_ASSISTANT_SCHEMA)
    expect(request.system).toContain(JSON.stringify(EDITOR_AI_CATALOG.filter(item => !['grid-3', 'grid-4'].includes(item.id))))
    expect(request.system).toContain(AI_GRID_LAYOUT_RULE)
    expect(request.system).toContain('Estilo seleccionado: corporate')
    expect(request).toMatchObject({ feature: 'editor_assistant', effort: 'high' })
    expect(output).toMatchObject({ type: 'template', styleId: 'corporate', subject: 'Diseño que transforma tu espacio' })
    expect(mock.getBrandKit).not.toHaveBeenCalled()
    expect(mock.audienceContext).not.toHaveBeenCalled()
    expect(mock.pastPerformance).not.toHaveBeenCalled()
    expect(output.campaign).toBeUndefined()
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

  it.each([
    ['grid-3', 3, ['grid-2', 'card']],
    ['grid-4', 4, ['grid-2', 'grid-2']],
  ] as const)('pairs every item of a complete %s returned outside the requested schema', async (id, count, expectedIds) => {
    const images = Array.from({ length: count }, (_, i) => `https://marca.es/pieza-${i}.jpg`)
    mock.gatherPageContext.mockResolvedValue({ title: 'Colección', text: 'Piezas reales.', images })
    const fields = {
      title: Array.from({ length: count }, (_, i) => `Pieza ${i + 1}`),
      subtitle: Array.from({ length: count }, (_, i) => `Diseño para el espacio ${i + 1}.`), images,
    }
    mock.aiJson.mockResolvedValue(plan([block('hero'), block(id, fields), block('button'), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief({
      includeSignature: true, signature: { ...emptyAssistantSignature(), name: 'Ana García', email: 'ana@marca.es' },
    }) })
    expect(output.blocks.map(item => item.id)).toEqual(['hero', ...expectedIds, 'button', 'signature', 'unsubscribe'])
    for (const key of ['title', 'subtitle', 'images'] as const) {
      expect(output.blocks.slice(1, 3).flatMap(item => item.fields[key] ?? [])).toEqual(fields[key])
    }
    expect(output.blocks.find(item => item.id === 'button')?.fields.buttonUrl).toBe(primaryUrl)
    expect(output.blocks.at(-2)?.fields.title).toBe('Ana García')
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('passes all paired items to a refinement even when splitting produced more than 16 modules', async () => {
    const priorGrids = Array.from({ length: 8 }, (_, i) => block('grid-4', {
      title: Array.from({ length: 4 }, (_, j) => `Pieza ${i * 4 + j + 1}`),
    }))
    mock.aiJson.mockResolvedValueOnce(plan([block('hero'), ...priorGrids, block('unsubscribe')]))
    const previous = await generateEditorAssistant({ brief: brief() })
    expect(previous.blocks).toHaveLength(18)
    mock.aiJson.mockResolvedValueOnce(plan(previous.blocks.map(item => block(item.id, Object.fromEntries(
      Object.entries(item.fields).map(([key, value]) => [key, Array.isArray(value) ? value : [value]]),
    )))))
    const revised = await generateEditorAssistant({ brief: brief(), previous, instruction: 'Haz los textos más breves.' })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(revised.blocks).toEqual(previous.blocks)
    const sent = JSON.parse(mock.aiJson.mock.calls[1][0].messages[0].content).previous.blocks
    expect(sent).toEqual(previous.blocks)
    expect(sent.flatMap((item: any) => item.fields.title ?? [])).toContain('Pieza 32')
  })

  it('pairs wide grids in a prior draft before requesting a revision', async () => {
    await generateEditorAssistant({ brief: brief(), instruction: 'Simplifica los textos.', previous: plan([
      block('hero'), block('grid-3', { title: ['Uno', 'Dos', 'Tres'] }), block('unsubscribe'),
    ]) })
    const previous = JSON.parse(mock.aiJson.mock.calls[0][0].messages[0].content).previous.blocks
    expect(previous.map((item: any) => item.id)).toEqual(['hero', 'grid-2', 'card', 'unsubscribe'])
    expect(previous.slice(1, 3).flatMap((item: any) => item.fields.title)).toEqual(['Uno', 'Dos', 'Tres'])
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
      block('header-pro', { title: ['Diseño que acompaña tu día'], logo: ['https://invented.es/logo.png'] }),
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
        blocks: Array.from({ length: 32 }, () => ({ id: 'text', fields: { title: ['t'.repeat(12000)], unexpected: ['not-forwarded'] } })),
      },
    })
    const request = JSON.parse(mock.aiJson.mock.calls[0][0].messages[0].content)
    expect(request.requestedRevision).toHaveLength(2500)
    expect(request.previous.name).toHaveLength(100)
    expect(request.previous.subject).toHaveLength(150)
    expect(request.previous.preheader).toHaveLength(250)
    expect(request.previous.blocks.length).toBeLessThanOrEqual(33)
    expect(request.previous.blocks.filter((item: any) => item.id === 'text')).toHaveLength(32)
    expect(request.previous.blocks[0].fields.title).toHaveLength(12000)
    expect(JSON.stringify(request)).not.toContain('not-forwarded')
    expect(output.text).toMatch(/revisión/i)
  })

  it.each([
    { blocks: Array.from({ length: 41 }, () => block('text')) },
    { blocks: [block('hero'), ...Array.from({ length: 20 }, () => block('grid-4')), block('unsubscribe')] },
  ])('rejects prior drafts too large to preserve instead of silently slicing their modules', async ({ blocks }) => {
    await expect(generateEditorAssistant({ brief: brief(), previous: plan(blocks), instruction: 'Cambia solo el asunto.' }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: expect.stringMatching(/40 módulos/) })
    expect(mock.aiJson).not.toHaveBeenCalled()
    expect(mock.gatherPageContext).not.toHaveBeenCalled()
  })

  it('preserves the 33-module boundary created by 15 paired grids plus the approved signature', async () => {
    const approvedBrief = brief({ includeSignature: true, signature: { ...emptyAssistantSignature(), name: 'Ana García', email: 'ana@marca.es' } })
    mock.aiJson.mockResolvedValueOnce(plan([block('hero'), ...Array.from({ length: 15 }, (_, i) => block('grid-4', {
      title: Array.from({ length: 4 }, (_, j) => `Pieza ${i * 4 + j + 1}`),
    }))]))
    const previous = await generateEditorAssistant({ brief: approvedBrief })
    expect(previous.blocks).toHaveLength(33)
    mock.aiJson.mockResolvedValueOnce(plan(previous.blocks.map(item => block(item.id, Object.fromEntries(
      Object.entries(item.fields).map(([key, value]) => [key, Array.isArray(value) ? value : [value]]),
    )))))
    const output = await generateEditorAssistant({ brief: approvedBrief, previous, instruction: 'Cambia solo el asunto.' })
    expect(output.blocks.slice(0, -1)).toEqual(previous.blocks.slice(0, -1))
    expect(output.blocks.at(-1)?.id).toBe('unsubscribe')
    expect(JSON.parse(mock.aiJson.mock.calls[1][0].messages[0].content).previous.blocks).toEqual(previous.blocks)
  })

  it.each([
    block('text', { title: ['t'.repeat(12001)] }),
    block('grid-2', { title: ['Uno', 'Dos', 'Tercero que no debe desaparecer'] }),
  ])('rejects previous content that normalization would truncate instead of forwarding a partial draft', async overflow => {
    await expect(generateEditorAssistant({ brief: brief(), previous: plan([block('hero'), overflow, block('unsubscribe')]), instruction: 'Cambia solo el asunto.' }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: expect.stringMatching(/evitar recortes/) })
    expect(mock.aiJson).not.toHaveBeenCalled()
  })

  it('repairs a final design exceeding the assembler capacity after pairing, without returning a truncated draft', async () => {
    const previous = plan([block('hero'), ...Array.from({ length: 28 }, () => block('text')), block('unsubscribe')])
    const overflow = plan([block('hero'), ...Array.from({ length: 25 }, () => block('grid-4')), block('unsubscribe')])
    mock.aiJson.mockResolvedValueOnce(overflow).mockResolvedValueOnce(plan())
    const output = await generateEditorAssistant({ brief: brief(), previous, instruction: 'Organiza mejor la lectura.' })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(mock.aiJson.mock.calls[1][0].messages.at(-1).content).toMatch(/40 módulos/)
    expect(output.blocks.map(item => item.id)).toEqual(['hero', 'text', 'button', 'unsubscribe'])
  })

  it.each([null, 5, [], { fields: {} }, { id: 'text', fields: [] }])('repairs malformed model modules without a runtime TypeError (%j)', async malformed => {
    mock.aiJson.mockResolvedValueOnce(plan([block('hero'), malformed as any, block('unsubscribe')])).mockResolvedValueOnce(plan())
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(output.blocks.some(item => item.id === 'text')).toBe(true)
  })

  it('ignores incomplete model signature objects and inserts only approved identity', async () => {
    mock.aiJson.mockResolvedValue(plan([block('hero'), block('text'), { id: 'signature' } as any, block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief({ includeSignature: true, signature: { ...emptyAssistantSignature(), name: 'Ana García' } }) })
    expect(output.blocks.at(-2)?.fields.title).toBe('Ana García')
  })

  it('repairs overflowing field arrays rather than silently dropping an extra product', async () => {
    mock.aiJson.mockResolvedValueOnce(plan([block('hero'), block('grid-2', { title: ['Uno', 'Dos', 'Tres'], subtitle: ['Primero', 'Segundo', 'Tercero'] }), block('unsubscribe')]))
      .mockResolvedValueOnce(plan([block('hero'), block('grid-2', { title: ['Uno', 'Dos'], subtitle: ['Primero', 'Segundo'] }), block('card', { title: ['Tres'], subtitle: ['Tercero'] }), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(mock.aiJson.mock.calls[1][0].messages.at(-1).content).toMatch(/sobran elementos.*no los descartes/)
    expect(output.blocks.slice(1, 3).flatMap(item => item.fields.title ?? [])).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('repairs oversized card copy by moving detail to text modules without cutting it', async () => {
    const detail = 'Una descripción detallada de las piezas y sus acabados. '.repeat(14)
    mock.aiJson.mockResolvedValueOnce(plan([block('hero'), block('grid-2', { subtitle: [detail, 'Para todos los días.'] }), block('unsubscribe')]))
      .mockResolvedValueOnce(plan([block('hero'), block('grid-2', { subtitle: ['Piezas con acabados cuidados.', 'Para todos los días.'] }), block('text', { title: [detail] }), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(mock.aiJson.mock.calls[1][0].messages.at(-1).content).toMatch(/650 caracteres.*sin perder información/)
    expect(output.blocks.find(item => item.id === 'text')?.fields.title).toBe(detail.trim())
  })

  it('keeps a secondary CTA label aligned with its destination while applying the approved primary action', async () => {
    const contactUrl = 'https://marca.es/contacto'
    mock.aiJson.mockResolvedValue(plan([block('hero'), block('text'), block('button', { button: ['Consultar dudas'], buttonUrl: [contactUrl] }), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief({ offer: `Consultas en ${contactUrl}` }) })
    expect(output.blocks.find(item => item.id === 'hero')?.fields).toMatchObject({ button: 'Ver la colección', buttonUrl: primaryUrl })
    expect(output.blocks.find(item => item.id === 'button')?.fields).toMatchObject({ button: 'Consultar dudas', buttonUrl: contactUrl })
  })

  it('accepts the full supported length of an operator-approved CTA', async () => {
    const ctaText = 'a'.repeat(100)
    const output = await generateEditorAssistant({ brief: brief({ ctaText }) })
    expect(output.blocks.find(item => item.id === 'hero')?.fields.button).toBe(ctaText)
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('repairs HTML-rich copy before the field storage cap would cut its closing text', async () => {
    const copy = '<b>Valor</b>'.repeat(1100) + 'No pierdas el cierre.'
    mock.aiJson.mockResolvedValueOnce(plan([block('hero'), block('text', { title: [copy] }), block('unsubscribe')]))
      .mockResolvedValueOnce(plan([block('hero'), block('text', { title: ['<b>Valor</b>'.repeat(550)] }), block('text', { title: ['<b>Valor</b>'.repeat(550) + 'No pierdas el cierre.'] }), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(output.blocks.filter(item => item.id === 'text').map(item => item.fields.title).join('')).toBe(copy)
  })

  it('grounds composition guidance in the selected theme, objective and available imagery', async () => {
    await generateEditorAssistant({ brief: brief({ styleId: 'dark-gold', objective: 'Conseguir inscripciones al webinar', ctaUrl: '', useBrandKit: false }) })
    const context = JSON.parse(mock.aiJson.mock.calls[0][0].messages[0].content)
    expect(context.composition.sequence).toMatch(/evento.*inscripción/)
    expect(context.composition.visualSystem).toMatchObject({ fontFamily: 'Georgia, serif' })
    expect(context.composition.rhythm).toMatch(/tipográfica/)
    expect(context.composition.copyBudgets.gridItem).toEqual({ title: 110, subtitle: 650 })
  })

  it('repairs repeated opening headlines while allowing distinct branded headers and hero messages', async () => {
    mock.aiJson.mockResolvedValueOnce(plan([block('header-pro'), block('hero'), block('text'), block('unsubscribe')]))
      .mockResolvedValueOnce(plan([block('header-pro', { title: ['La nueva colección de Marca'] }), block('hero'), block('text'), block('unsubscribe')]))
    const output = await generateEditorAssistant({ brief: brief() })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(mock.aiJson.mock.calls[1][0].messages.at(-1).content).toMatch(/repiten el mismo titular/)
    expect(output.blocks.filter(item => ['header-pro', 'hero'].includes(item.id)).map(item => item.fields.title)).toEqual(['La nueva colección de Marca', 'Diseño para disfrutar 1'])
  })
})

describe('complete campaign assistant generation', () => {
  const campaign = {
    subjectB: 'Tu hogar, con un nuevo diseño', followUpSubject: 'Las piezas que te esperan este otoño',
    sendTime: { weekday: 'tuesday', hour: 10, reason: 'Una pausa por la mañana para explorar la colección.' },
  }
  const options = { listId: 7, url: 'https://marca.es/referencia', aiImages: false }

  it.each([17, 40])('generates a complete %i-module campaign without losing content or campaign metadata', async count => {
    const paragraphs = Array.from({ length: count - 2 }, (_, i) => `Selección aprobada ${i + 1}`)
    mock.aiJson.mockResolvedValue({ ...plan([
      block('hero'), ...paragraphs.map(copy => block('text', { title: [copy] })), block('unsubscribe'),
    ]), campaign })
    const output = await generateEditorAssistant({ brief: brief(), campaignOptions: options })
    expect(output.blocks).toHaveLength(count)
    expect(output.blocks.filter(item => item.id === 'text').map(item => item.fields.title)).toEqual(paragraphs)
    expect(output.campaign).toEqual(campaign)
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
  })

  it('uses paired grids in complete campaigns while preserving campaign metadata', async () => {
    mock.aiJson.mockResolvedValue({ ...plan([
      block('hero'), block('grid-3', { title: ['Uno', 'Dos', 'Tres'] }), block('unsubscribe'),
    ]), campaign })
    const output = await generateEditorAssistant({ brief: brief(), campaignOptions: options })
    expect(output.blocks.map(item => item.id)).toEqual(['hero', 'grid-2', 'card', 'unsubscribe'])
    expect(output.blocks.slice(1, 3).flatMap(item => item.fields.title ?? [])).toEqual(['Uno', 'Dos', 'Tres'])
    expect(output.campaign).toEqual(campaign)
    const ids = mock.aiJson.mock.calls[0][0].schema.properties.blocks.items.properties.id.enum
    expect(ids).toContain('grid-2')
    expect(ids).not.toContain('grid-3')
    expect(ids).not.toContain('grid-4')
  })

  it('produces the native plan and campaign metadata together using the selected list and historical performance', async () => {
    mock.aiJson.mockResolvedValue({ ...plan(), campaign })
    const output = await generateEditorAssistant({ brief: brief(), campaignOptions: options })
    expect(mock.aiJson).toHaveBeenCalledTimes(1)
    const request = mock.aiJson.mock.calls[0][0]
    expect(request).toMatchObject({ feature: 'campaign_generate', schema: CAMPAIGN_ASSISTANT_SCHEMA })
    const input = JSON.parse(request.messages[0].content)
    expect(input).toMatchObject({ reference: { url: options.url }, audienceContext: mock.audienceContext(), pastPerformance: mock.pastPerformance() })
    expect(mock.audienceContext).toHaveBeenCalledWith(7)
    expect(mock.gatherPageContext).toHaveBeenCalledExactlyOnceWith(options.url)
    expect(output.campaign).toEqual(campaign)
    expect(output.blocks.find(item => item.id === 'hero')?.fields.buttonUrl).toBe(primaryUrl)
    expect(output.blocks.at(-1)?.id).toBe('unsubscribe')
  })

  it('never substitutes the reference URL for an omitted main call to action or invents a signature', async () => {
    mock.aiJson.mockResolvedValue({ ...plan([block('hero', { buttonUrl: [options.url] }), block('text'), block('signature', { title: ['Invented Person'] }), block('unsubscribe')]), campaign })
    const output = await generateEditorAssistant({ brief: brief({ ctaUrl: '', useBrandKit: false, includeSignature: true }), campaignOptions: options })
    expect(output.blocks.find(item => item.id === 'hero')?.fields.buttonUrl).toBe('')
    expect(output.blocks.some(item => item.id === 'signature')).toBe(false)
    expect(output.warnings.join(' ')).toMatch(/firma/)
  })

  it.each([
    null, [], { listId: 0 }, { listId: -1 }, { listId: 1.5 }, { listId: '7' },
    { url: 'javascript:alert(1)' }, { url: 'https://user:secret@marca.es/' }, { url: 123 }, { aiImages: 'true' },
  ])('rejects invalid campaign options before fetching references or calling AI (%j)', async (campaignOptions) => {
    await expect(generateEditorAssistant({ brief: brief(), campaignOptions })).rejects.toMatchObject({ statusCode: 400 })
    expect(mock.gatherPageContext).not.toHaveBeenCalled()
    expect(mock.aiJson).not.toHaveBeenCalled()
    expect(mock.audienceContext).not.toHaveBeenCalled()
  })

  it.each([
    undefined, { ...campaign, subjectB: '' }, { ...campaign, followUpSubject: '' },
    { ...campaign, sendTime: { ...campaign.sendTime, weekday: 'tomorrow' } },
    ...[-1, 24, 12.5, NaN, Infinity, '10'].map(hour => ({ ...campaign, sendTime: { ...campaign.sendTime, hour } })),
  ])('rejects invalid campaign metadata after one repair attempt (%j)', async (metadata) => {
    mock.aiJson.mockImplementation(async () => ({ ...plan(), campaign: metadata }))
    await expect(generateEditorAssistant({ brief: brief(), campaignOptions: options })).rejects.toMatchObject({ code: 'invalid_output' })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
  })

  it('repairs invalid send-time metadata while bounding subjects and explanations', async () => {
    mock.aiJson.mockResolvedValueOnce({ ...plan(), campaign: { ...campaign, sendTime: { ...campaign.sendTime, hour: 99 } } })
      .mockResolvedValueOnce({ ...plan(), campaign: { ...campaign, subjectB: ` ${'b'.repeat(400)} `, followUpSubject: 'f'.repeat(400), sendTime: { ...campaign.sendTime, reason: 'r'.repeat(900) } } })
    const output = await generateEditorAssistant({ brief: brief(), campaignOptions: options })
    expect(mock.aiJson).toHaveBeenCalledTimes(2)
    expect(output.campaign?.subjectB).toHaveLength(150)
    expect(output.campaign?.followUpSubject).toHaveLength(150)
    expect(output.campaign?.sendTime.reason).toHaveLength(600)
    expect(output.campaign?.sendTime.hour).toBe(10)
  })

  it.each([false, true])('permits descriptive image prompts only when AI images are enabled (%s)', async (aiImages) => {
    const prompt = 'Professional interior photograph of a cozy living room with soft natural light'
    mock.aiJson.mockImplementation(async () => ({ ...plan([
      block('hero'), block('text'), block('image', { images: [prompt] }),
      block('grid-2', { images: ['https://invented.es/photo.jpg', approvedImage] }), block('unsubscribe'),
    ]), campaign }))
    const output = await generateEditorAssistant({ brief: brief(), campaignOptions: { ...options, aiImages } })
    expect(output.blocks.find(item => item.id === 'image')?.fields.images).toBe(aiImages ? prompt : undefined)
    expect(output.blocks.find(item => item.id === 'grid-2')?.fields.images).toEqual(['', approvedImage])
    expect(JSON.stringify(output.blocks)).not.toContain('invented.es')
  })

  it('preserves valid prior campaign metadata during a refinement without forwarding extra fields', async () => {
    mock.aiJson.mockResolvedValue({ ...plan(), campaign })
    await generateEditorAssistant({
      brief: brief(), campaignOptions: options, instruction: 'Haz el mensaje más breve.',
      previous: { ...plan(), campaign: { ...campaign, hidden: 'not-forwarded', sendTime: { ...campaign.sendTime, recipient: 'not-forwarded' } } },
    })
    const input = JSON.parse(mock.aiJson.mock.calls[0][0].messages[0].content)
    expect(input.previous.campaign).toEqual(campaign)
    expect(JSON.stringify(input)).not.toContain('not-forwarded')
  })
})
