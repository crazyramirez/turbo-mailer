import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_GRID_LAYOUT_RULE } from '~/utils/aiGridLayout'
import type { GeneratedBlock, GeneratedCampaign } from '~/server/utils/ai/campaign-gen'

const mock = vi.hoisted(() => ({
  aiJson: vi.fn(), safeFetch: vi.fn(), getBrandKit: vi.fn(), brandBrief: vi.fn(),
  all: vi.fn(), get: vi.fn(),
}))

// These generation regressions must never initialize the live database or use a real provider/network.
vi.mock('~/server/db/index', () => ({ sqlite: { prepare: vi.fn(() => ({ all: mock.all, get: mock.get })) } }))
vi.mock('~/server/utils/ai/provider', () => ({ aiJson: mock.aiJson }))
vi.mock('~/server/utils/safe-fetch', () => ({ safeFetch: mock.safeFetch }))
vi.mock('~/server/utils/ai/brand-kit', () => ({ getBrandKit: mock.getBrandKit, brandBrief: mock.brandBrief }))

const { generateCampaign } = await import('~/server/utils/ai/campaign-gen')
const primaryUrl = 'https://marca.es/coleccion'
const imageUrls = ['https://marca.es/uno.jpg', 'https://marca.es/dos.jpg', 'https://marca.es/tres.jpg', 'https://marca.es/cuatro.jpg']

function block(id: string, patch: Partial<GeneratedBlock> = {}): GeneratedBlock {
  return { id, badge: [], title: [], subtitle: [], button: [], buttonUrl: [], images: [], price: [], code: [], contact: [], ps: [], ...patch }
}

function campaign(blocks: GeneratedBlock[]): GeneratedCampaign {
  return {
    name: 'Colección de otoño', subject: 'Descubre la colección', subjectB: 'Tu próximo favorito',
    preheader: 'Piezas elegidas para tu hogar.', styleId: 'corporate', blocks,
    followUpSubject: 'La colección te espera', sendTime: { weekday: 'tuesday', hour: 10, reason: 'Una pausa para descubrir.' },
    rationale: 'Una selección sencilla con un objetivo claro.',
  }
}

const input = { brief: 'Presenta la colección de otoño.', goal: 'announce' as const, language: 'es', useBrandKit: false }

beforeEach(() => {
  vi.resetAllMocks()
  mock.all.mockReturnValue([])
  mock.getBrandKit.mockReturnValue(null)
  mock.brandBrief.mockReturnValue('')
  mock.safeFetch.mockResolvedValue({
    url: primaryUrl,
    body: Buffer.from(`<html><title>Colección</title><body>${imageUrls.map(url => `<img src="${url}">`).join('')}</body></html>`),
  })
  mock.aiJson.mockImplementation(async () => campaign([block('hero', { title: ['Colección'] }), block('text', { title: ['Descubre nuestras piezas.'] })]))
})

describe('legacy campaign generation grid defaults', () => {
  it('requests two-column grids in both the schema and prompt', async () => {
    await generateCampaign(input)
    const request = mock.aiJson.mock.calls[0][0]
    const ids = request.schema.properties.blocks.items.properties.id.enum

    expect(ids).toContain('grid-2')
    expect(ids).toContain('card')
    expect(ids).not.toContain('grid-3')
    expect(ids).not.toContain('grid-4')
    expect(request.system).toContain(AI_GRID_LAYOUT_RULE)
    expect(mock.safeFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['grid-3', 3, ['grid-2', 'card']],
    ['grid-4', 4, ['grid-2', 'grid-2']],
  ] as const)('recovers every item when a provider ignores the schema and returns %s', async (id, count, expectedIds) => {
    const fields = {
      title: Array.from({ length: count }, (_, i) => `Producto ${i + 1}`),
      subtitle: Array.from({ length: count }, (_, i) => `Descripción ${i + 1}`),
      images: Array.from({ length: count }, (_, i) => `asset:${i}`),
    }
    const signature = block('signature', { title: ['Ana García'], subtitle: ['Marca'], contact: ['ana@marca.es'], ps: ['Hablamos pronto.'] })
    mock.aiJson.mockResolvedValue(campaign([
      block('hero', { title: ['Colección'], button: ['Ver colección'], buttonUrl: [primaryUrl] }),
      block(id, fields), block('unsubscribe', { subtitle: ['Pie desplazado'] }),
      block('button', { button: ['Ver piezas'], buttonUrl: ['https://invented.es/buy'] }), signature,
    ]))

    const output = await generateCampaign({ ...input, url: primaryUrl })
    expect(output.campaign.blocks.map(item => item.id)).toEqual(['hero', ...expectedIds, 'button', 'signature', 'unsubscribe'])
    const cards = output.campaign.blocks.slice(1, 3)
    for (const key of ['title', 'subtitle', 'images'] as const) {
      expect(cards.flatMap(item => item[key])).toEqual(fields[key])
    }
    expect(output.campaign.blocks.find(item => item.id === 'hero')?.buttonUrl).toEqual([primaryUrl])
    expect(output.campaign.blocks.find(item => item.id === 'button')?.buttonUrl).toEqual([primaryUrl])
    expect(output.campaign.blocks.at(-2)).toEqual(signature)
    expect(output.campaign.blocks.filter(item => item.id === 'unsubscribe')).toHaveLength(1)
    expect(output.campaign.blocks.at(-1)?.subtitle[0]).toContain('{{COMPANY_ADDRESS}}')
    expect(output.assets).toEqual(imageUrls)
    expect(output.links).toEqual([primaryUrl])
    expect(output.campaign.sendTime).toEqual({ weekday: 'tuesday', hour: 10, reason: 'Una pausa para descubrir.' })
  })

  it('keeps rejected image slots in their original positions when the third item becomes a card', async () => {
    mock.aiJson.mockResolvedValue(campaign([
      block('hero', { title: ['Colección'] }),
      block('grid-3', { title: ['Uno', 'Dos', 'Tres'], subtitle: ['', 'Segundo', 'Tercero'], images: ['asset:99', 'asset:1', 'asset:2'] }),
    ]))

    const output = await generateCampaign({ ...input, url: primaryUrl })
    expect(output.campaign.blocks.find(item => item.id === 'grid-2')).toMatchObject({ title: ['Uno', 'Dos'], subtitle: ['', 'Segundo'], images: ['', 'asset:1'] })
    expect(output.campaign.blocks.find(item => item.id === 'card')).toMatchObject({ title: ['Tres'], subtitle: ['Tercero'], images: ['asset:2'] })
  })
})
