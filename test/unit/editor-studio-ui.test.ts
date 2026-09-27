// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive, ref, shallowRef, type App, type Component } from 'vue'
import EditorLeftSidebar from '~/components/editor/EditorLeftSidebar.vue'
import EditorCanvas from '~/components/editor/EditorCanvas.vue'
import EditorHeader from '~/components/editor/EditorHeader.vue'
import ImageModal from '~/components/editor/modals/ImageModal.vue'
import { editorBlocks } from '~/utils/editorBlocks'
import es from '~/i18n/locales/es.json'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, any>,
  blocks: { insertBlock: vi.fn(), handleSidebarDragStart: vi.fn(), handleSidebarDragEnd: vi.fn(), applyImageSettings: vi.fn() },
  manager: { loadTemplate: vi.fn(), deleteTemplate: vi.fn(), duplicateTemplate: vi.fn(), renameTemplate: vi.fn(), handleSave: vi.fn(), saveTemplate: vi.fn(), downloadHtml: vi.fn() },
  engine: { handleIframeLoad: vi.fn(), undo: vi.fn(), redo: vi.fn() },
}))
vi.mock('~/composables/useEditorState', () => ({ useEditorState: () => mocks.state }))
vi.mock('~/composables/useTemplateManager', () => ({ useTemplateManager: () => mocks.manager }))
vi.mock('~/composables/useBlockEditor', () => ({ useBlockEditor: () => mocks.blocks }))
vi.mock('~/composables/useIframeEngine', () => ({ useIframeEngine: () => mocks.engine }))
vi.mock('~/components/editor/modals/VersionsModal.vue', () => ({ default: { template: '<div />' } }))
vi.mock('~/components/editor/modals/ResourceManagerModal.vue', () => ({ default: { template: '<div />' } }))

let app: App | null = null
function t(key: string, values: Record<string, unknown> = {}) {
  const value = key.split('.').reduce<any>((node, part) => node?.[part], es) ?? key
  return String(value).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''))
}
function query<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`Missing element: ${selector}`)
  return found
}
async function mount(component: Component) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(component)
  app.config.globalProperties.$t = t as typeof app.config.globalProperties.$t
  app.mount(host)
  await nextTick()
}
async function fill(selector: string, value: string, event = 'input') {
  const input = query<HTMLInputElement>(selector)
  input.value = value
  input.dispatchEvent(new Event(event, { bubbles: true }))
  await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mocks.state, {
    templates: ref([{ name: 'Otoño' }, { name: 'Clientes' }]), currentTemplate: ref('Otoño'), showTemplateModal: ref(false),
    isTemplateLoading: ref(false), isMorphing: ref(false), showAITemplateModal: ref(false),
    iframeRef: shallowRef(null), viewMode: ref('desktop'), layerList: shallowRef([]),
    isDraggingOverIframe: ref(false), darkModePreview: ref(false),
    desktopPreviewWidth: ref(820), mobilePreviewWidth: ref(375), previewZoom: ref('fit'),
    undoStack: ref(['initial', 'edited']), redoStack: ref([]), lastSavedTime: ref(''), isSaving: ref(false),
    imageModal: reactive({ visible: true, src: 'https://example.test/image.png', alt: 'Una terraza soleada', decorative: false, link: '', target: '_blank' }),
  })
  vi.stubGlobal('useI18n', () => ({ t }))
  vi.stubGlobal('useEditorState', () => mocks.state)
  vi.stubGlobal('useTemplateManager', () => mocks.manager)
  vi.stubGlobal('useIframeEngine', () => mocks.engine)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Editor Pro module library', () => {
  it('searches translated module names without accents and inserts the actual module on activation', async () => {
    await mount(EditorLeftSidebar)
    expect(document.querySelectorAll('.module-card')).toHaveLength(editorBlocks.length)
    await fill('.library-search input', 'boton')
    const card = query<HTMLButtonElement>('.module-card')
    expect(card.dataset.moduleId).toBe('button')
    expect(card.tagName).toBe('BUTTON')
    card.click()
    expect(mocks.blocks.insertBlock).toHaveBeenCalledWith(editorBlocks.find(b => b.id === 'button')!.content)
  })

  it('combines categories and search, exposes empty results and resets both filters', async () => {
    await mount(EditorLeftSidebar)
    const layout = [...document.querySelectorAll<HTMLButtonElement>('.library-categories button')].find(button => button.textContent === 'Estructura')!
    layout.click()
    await nextTick()
    expect(layout.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelectorAll('.module-card')).toHaveLength(5)
    await fill('.library-search input', 'grid')
    expect(document.querySelectorAll('.module-card')).toHaveLength(3)
    await fill('.library-search input', 'no existe')
    expect(document.querySelectorAll('.module-card')).toHaveLength(0)
    query<HTMLButtonElement>('.library-empty button').click()
    await nextTick()
    expect(document.querySelectorAll('.module-card')).toHaveLength(editorBlocks.length)
    expect(query<HTMLInputElement>('.library-search input').value).toBe('')
  })

  it('keeps template actions separate from opening a template and disables insertion while loading', async () => {
    await mount(EditorLeftSidebar)
    expect(document.querySelector('button button')).toBeNull()
    query<HTMLButtonElement>('.btn-item-action.delete').click()
    expect(mocks.manager.deleteTemplate).toHaveBeenCalledWith('Otoño')
    expect(mocks.manager.loadTemplate).not.toHaveBeenCalled()
    query<HTMLButtonElement>('.nav-item').click()
    expect(mocks.manager.loadTemplate).toHaveBeenCalledWith('Otoño')
    mocks.state.isTemplateLoading.value = true
    await nextTick()
    expect(query<HTMLButtonElement>('.module-card').disabled).toBe(true)
  })
})

describe('Editor Pro preview', () => {
  it('fits the workspace without shrinking the email CSS viewport and preserves explicit 100% zoom', async () => {
    mocks.state.layerList.value = [{ id: 'a' }]
    await mount(EditorCanvas)
    const frame = query<HTMLElement>('.canvas-box')
    expect(frame.style.width).toBe('820px')
    expect(frame.style.transform).toBe(`scale(${552 / 820})`)
    expect(query<HTMLElement>('.canvas-stage').style.width).toBe('552px')
    await fill('.preview-zoom-select', '100', 'change')
    expect(mocks.state.previewZoom.value).toBe(100)
    expect(frame.style.width).toBe('820px')
    expect(frame.style.transform).toBe('scale(1)')
    expect(query<HTMLIFrameElement>('iframe').title).toBe('Vista previa de la plantilla')
  })

  it('uses exact mobile widths including only the external device frame, and opens the assistant from an empty canvas', async () => {
    await mount(EditorCanvas)
    query<HTMLButtonElement>('.canvas-start-button').click()
    expect(mocks.state.showAITemplateModal.value).toBe(true)
    mocks.state.viewMode.value = 'mobile'
    mocks.state.mobilePreviewWidth.value = 320
    await nextTick()
    expect(query<HTMLElement>('.canvas-box').style.width).toBe('344px')
    expect(query<HTMLIFrameElement>('iframe').style.width).toBe('320px')
    expect(query('.canvas-status').textContent).toContain('320 px')
  })

  it('remembers independent desktop and mobile width choices', async () => {
    await mount(EditorHeader)
    await fill('.preview-width-select', '700', 'change')
    expect(mocks.state.desktopPreviewWidth.value).toBe(700)
    query<HTMLButtonElement>('.v-pill:nth-child(2)').click()
    await nextTick()
    expect(query<HTMLSelectElement>('.preview-width-select').value).toBe('375')
    await fill('.preview-width-select', '414', 'change')
    expect(mocks.state.mobilePreviewWidth.value).toBe(414)
    query<HTMLButtonElement>('.v-pill').click()
    await nextTick()
    expect(query<HTMLSelectElement>('.preview-width-select').value).toBe('700')
  })
})

describe('Image accessibility controls', () => {
  it('edits alternative text and makes it inactive while an image is marked decorative', async () => {
    await mount(ImageModal)
    await fill('#image-settings-alt', 'Equipo reunido en la terraza')
    expect(mocks.state.imageModal.alt).toBe('Equipo reunido en la terraza')
    query<HTMLInputElement>('.image-decorative-option input').click()
    await nextTick()
    expect(mocks.state.imageModal.decorative).toBe(true)
    expect(query<HTMLInputElement>('#image-settings-alt').disabled).toBe(true)
    query<HTMLButtonElement>('.modal-footer-actions .premium-button').click()
    expect(mocks.blocks.applyImageSettings).toHaveBeenCalledOnce()
  })
})
