import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ readBody: vi.fn(), values: vi.fn(), insert: vi.fn(), prepare: vi.fn() }))
vi.mock('~/server/db/index', () => ({ db: { insert: mock.insert }, sqlite: { prepare: mock.prepare } }))
vi.mock('~/server/db/schema', () => ({ campaigns: {} }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', mock.readBody)
const { default: createCampaign } = await import('~/server/api/campaigns/index.post')

beforeEach(() => {
  vi.clearAllMocks()
  mock.insert.mockReturnValue({ values: mock.values })
  mock.values.mockImplementation(values => ({ returning: async () => [{ id: 42, ...values }] }))
})

describe('complete campaign creation', () => {
  const base = {
    name: ' Colección otoño ', subject: ' Diseño para tu hogar ', templateName: 'coleccion-otono',
    templateHtml: '<p>Descubre las piezas de la colección.</p>', preheader: ' Una colección para disfrutar. ', listId: 7,
  }

  it('persists the approved content and both additional subjects in one insert', async () => {
    mock.readBody.mockResolvedValue({ ...base, subjectB: ' Tu hogar, con un nuevo diseño ', followUpSubject: ' Las piezas que te esperan ' })
    const campaign = await createCampaign({} as any)
    expect(mock.insert).toHaveBeenCalledTimes(1)
    expect(campaign).toMatchObject({
      id: 42, name: 'Colección otoño', subject: 'Diseño para tu hogar', subjectB: 'Tu hogar, con un nuevo diseño',
      followUpSubject: 'Las piezas que te esperan', templateName: base.templateName, templateHtml: base.templateHtml,
      preheader: 'Una colección para disfrutar.', listId: 7, status: 'draft', scheduledAt: null,
    })
  })

  it('normalizes empty optional subjects and bounds supplied subjects consistently with campaign updates', async () => {
    mock.readBody.mockResolvedValue({ ...base, subjectB: ' ', followUpSubject: null })
    expect(await createCampaign({} as any)).toMatchObject({ subjectB: null, followUpSubject: null })
    mock.readBody.mockResolvedValue({ ...base, subjectB: 'b'.repeat(500), followUpSubject: 'f'.repeat(500) })
    const campaign = await createCampaign({} as any)
    expect(campaign.subjectB).toHaveLength(255)
    expect(campaign.followUpSubject).toHaveLength(255)
  })

  it.each([undefined, 'not-a-date', '2000-01-01T10:00:00.000Z'])('rejects a scheduled campaign without a valid future date (%s)', async (scheduledAt) => {
    mock.readBody.mockResolvedValue({ ...base, status: 'scheduled', scheduledAt })
    await expect(createCampaign({} as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it('preserves a draft date without implicitly scheduling the campaign', async () => {
    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString()
    mock.readBody.mockResolvedValue({ ...base, status: 'scheduled', scheduledAt })
    expect(await createCampaign({} as any)).toMatchObject({ status: 'scheduled', scheduledAt: new Date(scheduledAt) })
    mock.readBody.mockResolvedValue({ ...base, scheduledAt })
    expect(await createCampaign({} as any)).toMatchObject({ status: 'draft', scheduledAt: new Date(scheduledAt) })
    mock.readBody.mockResolvedValue({ ...base, status: 'draft', scheduledAt: null })
    expect(await createCampaign({} as any)).toMatchObject({ status: 'draft', scheduledAt: null })
  })
})
