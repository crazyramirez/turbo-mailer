// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: {
    templates: { value: [] }, currentTemplate: { value: 'Original' },
    isTemplateLoading: { value: false }, isSaving: { value: false },
    showTemplateModal: { value: false }, newTemplateName: { value: '' },
    lastSavedTime: { value: '' }, layerList: { value: [] }, htmlContent: { value: '<html>Original</html>' },
  },
  cleanHtml: vi.fn(() => '<html>Original con cambios</html>'),
  fetch: vi.fn(), broadcast: vi.fn(),
}))
vi.mock('~/composables/useEditorState', () => ({ useEditorState: () => mocks.state, defaultHtml: '' }))
vi.mock('~/composables/useIframeEngine', () => ({ useIframeEngine: () => ({ getSurgicalCleanHtml: mocks.cleanHtml }) }))
vi.mock('~/composables/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

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
    mocks.state.currentTemplate.value = 'Original'
    mocks.state.lastSavedTime.value = ''
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value) },
    })
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
})
