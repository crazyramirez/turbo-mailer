// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: {
    templates: { value: [] }, currentTemplate: { value: 'Original' },
    isTemplateLoading: { value: false }, isSaving: { value: false },
    showTemplateModal: { value: false }, newTemplateName: { value: '' },
    lastSavedTime: { value: '' }, layerList: { value: [] }, htmlContent: { value: '<html>Original</html>' },
    iframeRef: { value: null as { contentDocument: Document } | null },
  },
  cleanHtml: vi.fn(() => '<html>Original con cambios</html>'),
  fetch: vi.fn(), broadcast: vi.fn(), showToast: vi.fn(),
  engine: { updateHtml: vi.fn(), teardownEditor: vi.fn(), injectIframeContent: vi.fn(), setupIframeEvents: vi.fn(), refreshLayers: vi.fn() },
}))
vi.mock('~/composables/useEditorState', () => ({ useEditorState: () => mocks.state, defaultHtml: '' }))
vi.mock('~/composables/useIframeEngine', () => ({ useIframeEngine: () => ({ ...mocks.engine, getSurgicalCleanHtml: mocks.cleanHtml }) }))
vi.mock('~/composables/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))

import { useTemplateManager } from '~/composables/useTemplateManager'

function deferred() {
  let resolve!: (value?: unknown) => void
  let reject!: (cause?: unknown) => void
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('template saves while applying an assistant draft', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.broadcast.mockReset()
    mocks.showToast.mockClear()
    mocks.cleanHtml.mockReset().mockReturnValue('<html>Original con cambios</html>')
    for (const fn of Object.values(mocks.engine)) fn.mockReset()
    mocks.engine.updateHtml.mockImplementation(() => { mocks.state.htmlContent.value = mocks.cleanHtml() })
    mocks.state.currentTemplate.value = 'Original'
    mocks.state.lastSavedTime.value = ''
    mocks.state.htmlContent.value = '<html>Original</html>'
    mocks.state.layerList.value = []
    mocks.state.newTemplateName.value = ''
    mocks.state.showTemplateModal.value = false
    mocks.state.isTemplateLoading.value = false
    mocks.state.iframeRef.value = { contentDocument: document }
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value) },
      removeItem: (key: string) => { stored.delete(key) },
    })
    localStorage.setItem('last_edited_template', 'Original')
    vi.stubGlobal('useNuxtApp', () => ({ $i18n: { t: (key: string) => key } }))
    vi.stubGlobal('$fetch', mocks.fetch)
    vi.stubGlobal('BroadcastChannel', class {
      postMessage = mocks.broadcast
      close() {}
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not relabel an in-flight autosave or restore stale browser state after switching', async () => {
    const request = deferred()
    mocks.fetch.mockReturnValue(request.promise)
    const manager = useTemplateManager()
    const saving = manager.saveTemplate(true)
    expect(mocks.fetch).toHaveBeenCalledWith('/api/templates', {
      method: 'POST', body: { name: 'Original', content: '<html>Original con cambios</html>' },
    })
    mocks.state.currentTemplate.value = 'Propuesta IA'
    mocks.state.lastSavedTime.value = '12:00'
    localStorage.setItem('last_edited_template', 'Propuesta IA')
    request.resolve({ success: true })
    await saving
    expect(localStorage.getItem('last_edited_template')).toBe('Propuesta IA')
    expect(mocks.state.lastSavedTime.value).toBe('12:00')
    expect(mocks.broadcast).toHaveBeenCalledWith({ type: 'template-saved', name: 'Original', content: '<html>Original con cambios</html>' })
  })

  it('drains every pending save before a caller writes its final old-canvas snapshot', async () => {
    const first = deferred()
    const second = deferred()
    mocks.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const manager = useTemplateManager()
    const saveA = manager.saveTemplate(true)
    const saveB = manager.saveTemplate(true)
    let drained = false
    const wait = manager.awaitPendingSaves().then(() => { drained = true })
    first.resolve({ success: true })
    await saveA
    expect(drained).toBe(false)
    second.resolve({ success: true })
    await Promise.all([saveB, wait])
    expect(drained).toBe(true)
  })

  it('releases a failed autosave so the caller can retry its own preserved snapshot', async () => {
    const request = deferred()
    mocks.fetch.mockReturnValue(request.promise)
    const manager = useTemplateManager()
    const saving = manager.saveTemplate(true)
    const wait = manager.awaitPendingSaves()
    request.reject(new Error('Offline'))
    await Promise.all([saving, wait])
    expect(mocks.state.lastSavedTime.value).toBe('')
    expect(mocks.broadcast).not.toHaveBeenCalled()
    await expect(manager.awaitPendingSaves()).resolves.toBeUndefined()
  })

  it('drains an older autosave, writes the latest canvas, then requests and installs the next template', async () => {
    const oldSave = deferred()
    const finalSave = deferred()
    mocks.cleanHtml.mockReturnValue('<html>Primera edición</html>')
    mocks.fetch.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(finalSave.promise).mockResolvedValueOnce({ content: '<html>Nueva plantilla</html>' })
    const manager = useTemplateManager()
    const saving = manager.saveTemplate(true)
    mocks.cleanHtml.mockReturnValue('<html>Última edición antes de cambiar</html>')
    const switching = manager.loadTemplate('Nueva', false)
    expect(mocks.engine.updateHtml).toHaveBeenCalledOnce()
    expect(mocks.engine.teardownEditor).toHaveBeenCalledOnce()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.state.currentTemplate.value).toBe('Original')
    oldSave.resolve({ success: true })
    await saving
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, '/api/templates', {
      method: 'POST', body: { name: 'Original', content: '<html>Última edición antes de cambiar</html>' },
    })
    expect(mocks.engine.injectIframeContent).not.toHaveBeenCalled()
    finalSave.resolve({ success: true })
    await switching
    expect(mocks.fetch).toHaveBeenNthCalledWith(3, '/api/templates', { query: { name: 'Nueva' } })
    expect(mocks.state.currentTemplate.value).toBe('Nueva')
    expect(mocks.state.htmlContent.value).toBe('<html>Nueva plantilla</html>')
    expect(localStorage.getItem('last_edited_template')).toBe('Nueva')
    expect(mocks.engine.injectIframeContent).toHaveBeenCalledOnce()
  })

  it('aborts switching when saving the current template fails, and restores its editing events', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Disco lleno'))
    await useTemplateManager().loadTemplate('Nueva', false)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { name: 'Original' } })
    expect(mocks.state.currentTemplate.value).toBe('Original')
    expect(mocks.state.htmlContent.value).toBe('<html>Original con cambios</html>')
    expect(localStorage.getItem('last_edited_template')).toBe('Original')
    expect(mocks.engine.injectIframeContent).not.toHaveBeenCalled()
    expect(mocks.engine.setupIframeEvents).toHaveBeenCalledWith(document)
    expect(mocks.showToast).toHaveBeenCalledWith('editor.template_save_error', 'error')
  })

  it('keeps the original canvas and new-template dialog open if the required save fails', async () => {
    mocks.state.showTemplateModal.value = true
    mocks.state.newTemplateName.value = 'Nueva propuesta'
    mocks.fetch.mockRejectedValueOnce(new Error('Sin conexión'))
    await useTemplateManager().createNewTemplate()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.state.currentTemplate.value).toBe('Original')
    expect(mocks.state.htmlContent.value).toBe('<html>Original con cambios</html>')
    expect(mocks.state.newTemplateName.value).toBe('Nueva propuesta')
    expect(mocks.state.showTemplateModal.value).toBe(true)
    expect(mocks.engine.injectIframeContent).not.toHaveBeenCalled()
    expect(mocks.engine.setupIframeEvents).toHaveBeenCalledWith(document)
    expect(mocks.showToast).toHaveBeenCalledWith('editor.template_save_error', 'error')
  })

  it('keeps the saved original editable if fetching the chosen template fails', async () => {
    mocks.fetch.mockResolvedValueOnce({ success: true }).mockRejectedValueOnce(new Error('Plantilla no disponible'))
    await useTemplateManager().loadTemplate('No disponible', false)
    expect(mocks.state.currentTemplate.value).toBe('Original')
    expect(mocks.state.htmlContent.value).toBe('<html>Original con cambios</html>')
    expect(localStorage.getItem('last_edited_template')).toBe('Original')
    expect(mocks.state.isTemplateLoading.value).toBe(false)
    expect(mocks.engine.injectIframeContent).toHaveBeenCalledOnce()
    expect(mocks.showToast).toHaveBeenCalledWith('editor.template_load_error', 'error')
  })
})
