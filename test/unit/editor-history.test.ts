// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useEditorState } from '~/composables/useEditorState'
import { useIframeEngine } from '~/composables/useIframeEngine'
import { editorStyleBases } from '~/utils/editorStyles'
import { editorBlocks } from '~/utils/editorBlocks'

const mocks = vi.hoisted(() => {
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
  return { saveTemplate: vi.fn(), autoCreateTemplate: vi.fn(), showToast: vi.fn() }
})
vi.mock('~/composables/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))
vi.mock('~/composables/useTemplateManager', () => ({ useTemplateManager: () => ({ saveTemplate: mocks.saveTemplate, autoCreateTemplate: mocks.autoCreateTemplate }) }))

const state = useEditorState()
const engine = useIframeEngine()
let editor: ReturnType<typeof import('~/composables/useBlockEditor')['useBlockEditor']>
let doc: Document
function content(id: string) { return editorBlocks.find(block => block.id === id)!.content }
function title() { return doc.querySelector<HTMLElement>('[data-toggle="title"]')! }
function initialize(html = content('text')) {
  doc.head.innerHTML = '<style id="brand-styles">.brand-label { letter-spacing: .04em; }</style>'
  doc.body.innerHTML = `<main class="main-card">${html}</main>`
  doc.body.dataset.styleId = state.currentStyle.value.id
  doc.querySelectorAll<HTMLElement>('.editable-block').forEach(block => engine.initBlock(block, doc))
  engine.refreshLayers()
}
function cleanDoc() { return new DOMParser().parseFromString(engine.getSurgicalCleanHtml(), 'text/html') }

beforeAll(async () => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useIframeEngine', () => engine)
  vi.stubGlobal('useNuxtApp', () => ({ $i18n: { t: (key: string) => key } }))
  editor = (await import('~/composables/useBlockEditor')).useBlockEditor()
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  state.resetEditorState()
  state.currentStyle.value = structuredClone(JSON.parse(JSON.stringify(editorStyleBases[0])))
  state.currentTemplate.value = 'Campaña de prueba'
  state.htmlContent.value = ''
  state.darkModePreview.value = false
  state.promptData.visible = false
  document.body.innerHTML = '<iframe title="Editor test"></iframe>'
  state.iframeRef.value = document.querySelector('iframe')!
  doc = state.iframeRef.value.contentDocument!
  initialize()
})
afterEach(async () => {
  await vi.dynamicImportSettled()
  engine.teardownEditor()
  state.resetEditorState()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})
afterAll(() => vi.unstubAllGlobals())

describe('full document editor history', () => {
  it('restores theme metadata, body colors and head styles through undo and redo', () => {
    doc.body.style.backgroundColor = '#eef2ff'
    doc.body.setAttribute('data-style-body-bg', '#eef2ff')
    doc.head.querySelector('#brand-styles')!.textContent = '.brand-label { color: #4338ca; }'
    title().textContent = 'Primera propuesta'
    engine.pushToHistory()
    const originalStyleId = state.currentStyle.value.id

    const alternative = editorStyleBases.find(style => style.id !== originalStyleId)!
    state.currentStyle.value = { ...alternative, config: { ...alternative.config, bodyBg: '#152033' } }
    doc.body.style.backgroundColor = '#152033'
    doc.body.setAttribute('data-style-body-bg', '#152033')
    doc.head.querySelector('#brand-styles')!.textContent = '.brand-label { color: #fbbf24; }'
    title().textContent = 'Segunda propuesta'
    engine.pushToHistory()
    state.selectedElement.value = doc.querySelector('.editable-block')
    state.selectedSubElement.value = title()

    engine.undo()
    expect(title().textContent).toBe('Primera propuesta')
    expect(doc.body.style.backgroundColor).toBe('#eef2ff')
    expect(doc.head.querySelector('#brand-styles')!.textContent).toContain('#4338ca')
    expect(state.currentStyle.value.id).toBe(originalStyleId)
    expect(state.currentStyle.value.config.bodyBg).toBe('#eef2ff')
    expect(state.selectedElement.value).toBeNull()
    expect(state.selectedSubElement.value).toBeNull()
    expect(state.htmlContent.value).toContain('Primera propuesta')

    engine.redo()
    expect(title().textContent).toBe('Segunda propuesta')
    expect(doc.body.style.backgroundColor).toBe('#152033')
    expect(doc.head.querySelector('#brand-styles')!.textContent).toContain('#fbbf24')
    expect(state.currentStyle.value.id).toBe(alternative.id)
    expect(state.currentStyle.value.config.bodyBg).toBe('#152033')
    expect(doc.querySelectorAll('#editor-styles')).toHaveLength(1)
  })

  it('undoes typing before its debounce fires and can recover that exact text with redo', () => {
    title().textContent = 'Texto original'
    engine.pushToHistory()
    title().textContent = 'Edición recién escrita'
    engine.triggerAutosave()
    expect(state.undoStack.value).toHaveLength(1)
    engine.undo()
    expect(title().textContent).toBe('Texto original')
    expect(state.redoStack.value).toHaveLength(1)
    expect(engine.getSurgicalCleanHtml()).toBe(state.undoStack.value.at(-1))
    engine.redo()
    expect(title().textContent).toBe('Edición recién escrita')
    expect(state.redoStack.value).toHaveLength(0)
  })

  it('does not overwrite new typing with an obsolete redo branch', () => {
    title().textContent = 'Original'
    engine.pushToHistory()
    title().textContent = 'Primera edición'
    engine.triggerAutosave(true)
    engine.undo()
    title().textContent = 'Nueva dirección creativa'
    engine.triggerAutosave()
    engine.redo()
    expect(title().textContent).toBe('Nueva dirección creativa')
    expect(state.redoStack.value).toHaveLength(0)
    engine.undo()
    expect(title().textContent).toBe('Original')
  })

  it('preserves original custom CSS when applying a theme, and can undo the applied theme', () => {
    const originalCss = doc.head.querySelector('#brand-styles')!.textContent
    engine.pushToHistory()
    const alternative = editorStyleBases.find(style => style.id === 'midnight-gold')!
    state.currentStyle.value = alternative
    engine.applyStyleBase(alternative, true)
    engine.triggerAutosave(true)
    expect(doc.head.querySelector('#brand-styles')!.textContent).toBe(originalCss)
    expect(doc.getElementById('tm-theme-style')).not.toBeNull()
    engine.undo()
    expect(doc.head.querySelector('#brand-styles')!.textContent).toBe(originalCss)
    expect(state.currentStyle.value.id).toBe(editorStyleBases[0].id)
  })

  it('preserves custom colors and layout when opening an existing template without an explicit theme change', () => {
    doc.body.style.backgroundColor = '#abcdef'
    const card = doc.querySelector<HTMLElement>('.main-card')!
    card.style.maxWidth = '640px'
    card.style.borderRadius = '24px'
    title().style.color = '#123456'
    const originalCss = doc.head.querySelector('#brand-styles')!.textContent
    state.htmlContent.value = engine.getSurgicalCleanHtml()
    engine.injectIframeContent()
    expect(doc.body.style.backgroundColor).toBe('#abcdef')
    expect(doc.querySelector<HTMLElement>('.main-card')!.style.maxWidth).toBe('640px')
    expect(doc.defaultView!.getComputedStyle(doc.querySelector('.main-card')!).maxWidth).toBe('640px')
    expect(doc.querySelector<HTMLElement>('.main-card')!.style.borderRadius).toBe('24px')
    expect(title().style.color).toBe('#123456')
    expect(doc.head.querySelector('#brand-styles')!.textContent).toBe(originalCss)
    expect(doc.getElementById('tm-layout-style')).not.toBeNull()
  })
})

describe('clean export', () => {
  it('removes preview and editor artifacts without changing the live editor or removing campaign styling', () => {
    doc.documentElement.classList.add('dark-mode-simulation', 'campaign-document')
    doc.body.classList.add('preview-active', 'campaign-body')
    const block = doc.querySelector<HTMLElement>('.editable-block')!
    block.classList.add('selected', 'dragging', 'drag-over-top', 'module-drop-reveal', 'ai-improving')
    title().setAttribute('contenteditable', 'true')
    title().setAttribute('data-org-size', '20')
    doc.head.insertAdjacentHTML('beforeend', '<style id="editor-styles">.selected { outline: 2px solid blue; }</style>')
    doc.body.insertAdjacentHTML('beforeend', '<div id="floating-toolbar">tools</div><div id="drop-placeholder">drop</div><div data-ignore-save="true">helper</div>')
    const exported = cleanDoc()
    expect(exported.documentElement.classList.contains('dark-mode-simulation')).toBe(false)
    expect(exported.documentElement.classList.contains('campaign-document')).toBe(true)
    expect(exported.body.classList.contains('preview-active')).toBe(false)
    expect(exported.body.classList.contains('campaign-body')).toBe(true)
    expect(exported.querySelector('[contenteditable], [draggable], [data-org-size], [data-ignore-save], #editor-styles, #floating-toolbar, #drop-placeholder, .visor-drag-handle')).toBeNull()
    expect(exported.querySelector('.selected, .editable-block, .dragging, .drag-over-top, .module-drop-reveal, .ai-improving')).toBeNull()
    expect(exported.getElementById('brand-styles')).not.toBeNull()
    expect(exported.querySelector('[data-toggle="title"]')!.textContent).toBe(title().textContent)
    expect(doc.documentElement.classList.contains('dark-mode-simulation')).toBe(true)
    expect(doc.querySelector('.editable-block.selected')).toBe(block)
  })
})

describe('module insertion and image accessibility', () => {
  it('inserts after the selected block, applies the current theme and supports undo', async () => {
    initialize(content('text') + content('unsubscribe'))
    const selected = doc.querySelector<HTMLElement>('.editable-block')!
    state.selectedElement.value = selected
    state.currentStyle.value = editorStyleBases.find(style => style.id === 'midnight-gold')!
    editor.insertBlock(content('card'))
    await vi.dynamicImportSettled()
    const card = selected.nextElementSibling as HTMLElement
    expect(card.classList.contains('card-block')).toBe(true)
    expect(card.nextElementSibling?.classList.contains('unsubscribe-block')).toBe(true)
    expect(card.dataset.id).toBeTruthy()
    expect(state.selectedElement.value).toBe(card)
    expect(state.layerList.value).toHaveLength(3)
    expect(card.style.backgroundColor).toBeTruthy()
    expect(mocks.autoCreateTemplate).toHaveBeenCalledOnce()
    engine.undo()
    expect(doc.querySelector('.card-block')).toBeNull()
    expect(doc.querySelector('.unsubscribe-block')).not.toBeNull()
  })

  it.each(['none', 'footer', 'detached'])('keeps the legal footer last when selection is %s', async selection => {
    initialize(content('text') + content('unsubscribe'))
    state.selectedElement.value = selection === 'footer' ? doc.querySelector('.unsubscribe-block') : selection === 'detached' ? doc.createElement('div') : null
    editor.insertBlock(content('button'))
    await vi.dynamicImportSettled()
    const container = doc.querySelector('.main-card')!
    expect(container.lastElementChild?.classList.contains('unsubscribe-block')).toBe(true)
    expect(container.lastElementChild?.previousElementSibling?.classList.contains('cta-block')).toBe(true)
  })

  it('roundtrips descriptive and decorative images while preserving relative URLs', async () => {
    initialize(content('image'))
    const img = doc.querySelector<HTMLImageElement>('img')!
    img.setAttribute('src', '/uploads/product.png')
    img.setAttribute('alt', 'Producto artesanal')
    editor.openImageModal(img)
    expect(state.imageModal.src).toBe('/uploads/product.png')
    expect(state.imageModal.alt).toBe('Producto artesanal')
    expect(state.imageModal.decorative).toBe(false)
    state.imageModal.alt = '  Producto artesanal azul  '
    editor.applyImageSettings()
    await vi.dynamicImportSettled()
    expect(img.getAttribute('alt')).toBe('Producto artesanal azul')
    expect(img.getAttribute('src')).toBe('/uploads/product.png')
    editor.openImageModal(img)
    state.imageModal.decorative = true
    editor.applyImageSettings()
    await vi.dynamicImportSettled()
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('role')).toBe('presentation')
    editor.openImageModal(img)
    expect(state.imageModal.decorative).toBe(true)
    state.imageModal.decorative = false
    state.imageModal.alt = 'Producto acabado'
    editor.applyImageSettings()
    await vi.dynamicImportSettled()
    expect(cleanDoc().querySelector('img')!.getAttribute('alt')).toBe('Producto acabado')
    expect(img.hasAttribute('role')).toBe(false)
  })
})
