// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App, type Component } from 'vue'
import CampaignAssistant from '~/components/campaigns/CampaignAssistant.vue'
import AiCampaignWizard from '~/components/campaigns/AiCampaignWizard.vue'
import AITemplateModal from '~/components/editor/modals/AITemplateModal.vue'
import { editorStyleBases } from '~/utils/editorStyles'
import type { EditorAssistantDraft } from '~/utils/editorAssistant'
import es from '~/i18n/locales/es.json'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), generate: vi.fn(), push: vi.fn(), toast: vi.fn(),
  state: {} as Record<string, any>, loadTemplates: vi.fn(), awaitPendingSaves: vi.fn(),
  engine: { getSurgicalCleanHtml: vi.fn(), teardownEditor: vi.fn(), injectIframeContent: vi.fn(), setupIframeEvents: vi.fn() },
}))
vi.mock('~/composables/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }))
vi.mock('~/composables/useEditorState', () => ({ useEditorState: () => mocks.state }))
vi.mock('~/composables/useTemplateManager', () => ({ useTemplateManager: () => ({ loadTemplates: mocks.loadTemplates, awaitPendingSaves: mocks.awaitPendingSaves }) }))
vi.mock('~/composables/useIframeEngine', () => ({ useIframeEngine: () => mocks.engine }))

const oldHtml = '<html><body><p>Trabajo anterior conservado</p></body></html>'
const signature = { name: 'Ana Real', details: 'Equipo de ventas', email: 'ana@example.test', website: 'https://example.test', phone: '+34 600 111 222', imageUrl: '', ps: 'Gracias por leer.' }
const context = { brandConfigured: true, brand: { name: 'Marca Real', audience: 'Clientes anteriores', voice: 'Cercano', language: 'es' }, signatures: [{ id: 'campaign:12:0', sourceType: 'campaign', sourceName: 'Campaña anterior', updatedAt: 0, signature }], recentCampaigns: [] }

function proposal(title = 'Oferta de otoño'): EditorAssistantDraft {
  return {
    type: 'template', text: 'Propuesta lista', name: title, subject: `Descubre ${title}`, preheader: 'Una selección para ti',
    styleId: 'default', blocks: [{ id: 'text', fields: { title, subtitle: 'Oferta real hasta el 30 de octubre.' } }], warnings: [], rationale: 'Una composición clara.',
    campaign: { subjectB: 'Tu próxima elección', followUpSubject: 'Aún estás a tiempo', sendTime: { weekday: 'monday', hour: 10, reason: 'Audiencia profesional' } },
  }
}

let app: App | null = null
async function flush() {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}
function query<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}
async function click(selector: string | HTMLElement) {
  ;(typeof selector === 'string' ? query(selector) : selector).click()
  await flush()
}
async function fill(selector: string, value: string) {
  const el = query<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
  el.value = value
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  await flush()
}
function requestBodies(url: string) { return mocks.fetch.mock.calls.filter(([path]) => path === url).map(([, options]) => options.body) }
function primary() { return query<HTMLButtonElement>('.assistant-footer .primary-button') }
async function step(index: number) { await click(document.querySelectorAll<HTMLButtonElement>('.step-item')[index]!) }
function unmount() {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
}
async function mount(component: Component = CampaignAssistant, props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(component, props)
  app.component('NuxtLink', defineComponent({ setup: (_, { slots }) => () => h('a', slots.default?.()) }))
  app.mount(host)
  await flush()
}

/** Fill the actual rendered controls; do not call component internals. */
async function completeBrief(campaign: boolean) {
  await fill('.step-fields textarea[maxlength="3000"]', 'Presentar una oferta de otoño a nuestros clientes')
  await fill('.step-fields input[maxlength="600"]', 'Conseguir reservas')
  await fill('.step-fields textarea[maxlength="1000"]', 'Clientes que ya conocen la marca')
  if (campaign) await fill('.step-fields select', '3')
  await click(primary())
  await fill('.step-fields textarea[maxlength="5000"]', 'Consulta personalizada de 30 minutos por 25 euros')
  await fill('.step-fields input[maxlength="100"]', 'Reservar consulta')
  const urls = document.querySelectorAll<HTMLInputElement>('.step-fields input[type="url"]')
  urls[0]!.value = 'https://example.test/reservar'
  urls[0]!.dispatchEvent(new Event('input', { bubbles: true }))
  if (campaign) {
    urls[1]!.value = 'https://example.test/referencia'
    urls[1]!.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await fill('.step-fields textarea[maxlength="2500"]', 'Sin descuentos inventados')
  await click(primary())
  expect(document.querySelectorAll('.style-card')).toHaveLength(editorStyleBases.length)
  await fill('.step-fields input[maxlength="500"]', 'Claro y cercano')
  await fill('.step-fields select', 'fr')
  await fill('.step-fields textarea[maxlength="1500"]', 'Editorial con espacio entre bloques')
  if (campaign) await click(query<HTMLInputElement>('.step-fields input[type="checkbox"]'))
  await click(primary())
  expect(query<HTMLInputElement>('.step-fields input[maxlength="160"]').value).toBe(signature.name)
  expect(query<HTMLInputElement>('.step-fields input[type="email"]').value).toBe(signature.email)
  await fill('.step-fields textarea[maxlength="1000"]', 'Nos vemos pronto.')
  await click(primary())
  expect(document.querySelector('.brief-summary')).not.toBeNull()
}
async function generate(campaign = true) {
  await completeBrief(campaign)
  await click(primary())
  expect(query('.proposal-header h4').textContent).toBe('Oferta de otoño')
}

beforeEach(() => {
  vi.resetAllMocks()
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
  })
  mocks.generate.mockImplementation(async () => proposal())
  mocks.push.mockResolvedValue(undefined)
  mocks.loadTemplates.mockResolvedValue(undefined)
  mocks.awaitPendingSaves.mockResolvedValue(undefined)
  mocks.engine.getSurgicalCleanHtml.mockReturnValue(oldHtml)
  Object.assign(mocks.state, {
    showAITemplateModal: ref(true), currentTemplate: ref('Mi plantilla'), currentStyle: ref(editorStyleBases[0]),
    htmlContent: ref(oldHtml), lastSavedTime: ref(''), iframeRef: ref(null), undoStack: ref(['anterior']), redoStack: ref(['rehacer']),
    selectedElement: ref(null), selectedSubElement: ref(null), activePanel: ref('edit'), isTemplateLoading: ref(false),
  })
  vi.stubGlobal('useI18n', () => ({ locale: ref('es'), t: (key: string, values?: Record<string, unknown>) => {
    const value = key.split('.').reduce<any>((node, part) => node?.[part], es)
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (match, name) => String(values?.[name] ?? match)) : key
  } }))
  vi.stubGlobal('useRouter', () => ({ push: mocks.push }))
  vi.stubGlobal('useDashboardState', () => ({ showToast: mocks.toast }))
  vi.stubGlobal('$fetch', mocks.fetch)
  mocks.fetch.mockImplementation(async (url, options) => {
    if (url === '/api/ai/editor-context') return structuredClone(context)
    if (url === '/api/lists') return [{ id: 3, name: 'Clientes activos', contactCount: 42 }, { id: 7, name: 'Otra lista', contactCount: 8 }]
    if (url === '/api/ai/status') return { configured: true }
    if (url === '/api/ai/generate-template') return mocks.generate(options.body)
    if (url === '/api/email/repair') return { html: options.body.html, changes: [] }
    if (url === '/api/templates') return { success: true }
    if (url === '/api/campaigns') return { id: 91 }
    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => { unmount(); vi.unstubAllGlobals() })

describe('shared campaign assistant in the real Vue UI', () => {
  it('offers the same five steps, design choices, full brief and recalled signature in both entry points', async () => {
    await mount(AITemplateModal)
    const editorSteps = [...document.querySelectorAll('.step-item strong')].map(el => el.textContent)
    expect(editorSteps).toHaveLength(5)
    await generate(false)
    const editorRequest = requestBodies('/api/ai/generate-template')[0]
    expect(editorRequest).not.toHaveProperty('campaignOptions')
    unmount()
    await mount(AiCampaignWizard)
    expect([...document.querySelectorAll('.step-item strong')].map(el => el.textContent)).toEqual(editorSteps)
    await generate(true)
    const campaignRequest = requestBodies('/api/ai/generate-template')[1]
    expect(campaignRequest.brief).toEqual(editorRequest.brief)
    expect(campaignRequest.brief).toMatchObject({
      campaign: 'Presentar una oferta de otoño a nuestros clientes', objective: 'Conseguir reservas', audience: 'Clientes que ya conocen la marca',
      offer: 'Consulta personalizada de 30 minutos por 25 euros', ctaText: 'Reservar consulta', ctaUrl: 'https://example.test/reservar',
      tone: 'Claro y cercano', language: 'fr', visualDirection: 'Editorial con espacio entre bloques', constraints: 'Sin descuentos inventados',
      signature: { ...signature, ps: 'Nos vemos pronto.' },
    })
    expect(campaignRequest.campaignOptions).toEqual({ listId: 3, url: 'https://example.test/referencia', aiImages: true })
  })

  it('refines the reviewed draft with all campaign metadata and applies the resulting HTML snapshot', async () => {
    const apply = vi.fn().mockResolvedValue(undefined)
    await mount(CampaignAssistant, { open: true, campaign: true, apply })
    await generate()
    mocks.generate.mockResolvedValueOnce(proposal('Versión refinada'))
    await fill('#assistant-refinement', '  Haz el titular más directo  ')
    await click('.refinement-box button')
    const [first, second] = requestBodies('/api/ai/generate-template')
    expect(second).toMatchObject({ brief: first.brief, campaignOptions: first.campaignOptions, instruction: 'Haz el titular más directo', previous: proposal() })
    expect(second.previous.campaign).toEqual(proposal().campaign)
    await click(primary())
    expect(apply).toHaveBeenCalledOnce()
    const [draft, html, options] = apply.mock.calls[0]!
    expect(draft).toEqual(proposal('Versión refinada'))
    expect(html).toContain('Versión refinada')
    expect(options).toEqual({ listId: 3, scheduledAt: null })
  })

  it('blocks stale proposals after editing the brief or delivery options until regenerated', async () => {
    const apply = vi.fn().mockResolvedValue(undefined)
    await mount(CampaignAssistant, { open: true, campaign: true, apply })
    await generate()
    const firstRequest = requestBodies('/api/ai/generate-template')[0]
    await step(0)
    await fill('.step-fields input[maxlength="600"]', 'Conseguir nuevas suscripciones')
    await fill('.step-fields select', '7')
    await step(4)
    expect(document.querySelector('.changed-note')).not.toBeNull()
    expect(primary().disabled).toBe(true)
    await click(primary())
    expect(apply).not.toHaveBeenCalled()
    expect(firstRequest.brief.objective).toBe('Conseguir reservas')
    expect(firstRequest.campaignOptions.listId).toBe(3)
    mocks.generate.mockResolvedValueOnce(proposal('Nueva propuesta aprobada'))
    await click('.regenerate-button')
    expect(primary().disabled).toBe(false)
    await click(primary())
    expect(apply.mock.calls[0]![0].name).toBe('Nueva propuesta aprobada')
    expect(apply.mock.calls[0]![1]).toContain('Nueva propuesta aprobada')
    expect(apply.mock.calls[0]![2]).toEqual({ listId: 7, scheduledAt: null })
  })

  it('keeps the existing proposal and preview usable when a refinement fails', async () => {
    const apply = vi.fn().mockResolvedValue(undefined)
    await mount(CampaignAssistant, { open: true, campaign: true, apply })
    await generate()
    const preview = query<HTMLIFrameElement>('.preview-stage iframe').srcdoc
    mocks.generate.mockRejectedValueOnce({ data: { statusMessage: 'Servicio temporalmente ocupado' } })
    await fill('#assistant-refinement', 'Acorta el mensaje')
    await click('.refinement-box button')
    expect(query('[role="alert"]').textContent).toContain('Servicio temporalmente ocupado')
    expect(query<HTMLIFrameElement>('.preview-stage iframe').srcdoc).toBe(preview)
    expect(query<HTMLTextAreaElement>('#assistant-refinement').value).toBe('Acorta el mensaje')
    expect(primary().disabled).toBe(false)
    await click(primary())
    expect(apply.mock.calls[0]![0]).toEqual(proposal())
  })

  it('creates the campaign with the reviewed content, list, A/B subject and follow-up in one request', async () => {
    await mount(AiCampaignWizard)
    await generate()
    await click(primary())
    const [savedTemplate] = requestBodies('/api/templates')
    expect(requestBodies('/api/campaigns')).toEqual([{
      name: proposal().name, subject: proposal().subject, preheader: proposal().preheader,
      subjectB: proposal().campaign!.subjectB, followUpSubject: proposal().campaign!.followUpSubject,
      templateName: savedTemplate.name, templateHtml: savedTemplate.content, listId: 3, status: 'draft', scheduledAt: null,
    }])
    expect(savedTemplate.content).toContain('Oferta de otoño')
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/campaigns/91')
  })

  it('retries navigation without duplicating an already created campaign', async () => {
    mocks.push.mockRejectedValueOnce(new Error('No se pudo abrir la campaña'))
    await mount(AiCampaignWizard)
    await generate()
    await click(primary())
    expect(query('[role="alert"]').textContent).toContain('No se pudo abrir la campaña')
    await click(primary())
    expect(requestBodies('/api/templates')).toHaveLength(1)
    expect(requestBodies('/api/campaigns')).toHaveLength(1)
    expect(mocks.push).toHaveBeenCalledTimes(2)
  })

  it('backs up existing editor work before saving and applying a new editable template', async () => {
    await mount(AITemplateModal)
    await generate(false)
    await click(primary())
    const savedTemplates = requestBodies('/api/templates')
    expect(savedTemplates).toHaveLength(2)
    expect(savedTemplates[0]).toEqual({ name: 'Mi plantilla', content: oldHtml })
    expect(savedTemplates[1].content).toContain('Oferta de otoño')
    expect(savedTemplates[1].name).not.toBe('Mi plantilla')
    expect(mocks.state.currentTemplate.value).toBe(savedTemplates[1].name)
    expect(mocks.state.htmlContent.value).toBe(savedTemplates[1].content)
    expect(mocks.state.undoStack.value).toEqual([])
    expect(mocks.state.showAITemplateModal.value).toBe(false)
    expect(mocks.engine.injectIframeContent).toHaveBeenCalledOnce()
    expect(localStorage.getItem('editor_html_draft')).toBe(savedTemplates[1].content)
  })

  it('preserves old editor work and the new proposal if saving the new template fails', async () => {
    const originalFetch = mocks.fetch.getMockImplementation()!
    mocks.fetch.mockImplementation(async (url, options) => {
      if (url === '/api/templates' && options.body.name !== 'Mi plantilla') throw new Error('Almacenamiento no disponible')
      return originalFetch(url, options)
    })
    await mount(AITemplateModal)
    await generate(false)
    const preview = query<HTMLIFrameElement>('.preview-stage iframe').srcdoc
    await click(primary())
    expect(query('[role="alert"]').textContent).toContain('Almacenamiento no disponible')
    expect(mocks.state.currentTemplate.value).toBe('Mi plantilla')
    expect(mocks.state.htmlContent.value).toBe(oldHtml)
    expect(mocks.state.undoStack.value).toEqual(['anterior'])
    expect(mocks.state.redoStack.value).toEqual(['rehacer'])
    expect(mocks.state.showAITemplateModal.value).toBe(true)
    expect(mocks.engine.injectIframeContent).not.toHaveBeenCalled()
    expect(query<HTMLIFrameElement>('.preview-stage iframe').srcdoc).toBe(preview)
    expect(primary().disabled).toBe(false)
  })
})
