// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import { useEditorState } from '~/composables/useEditorState'
import { useIframeEngine } from '~/composables/useIframeEngine'
import { editorBlocks } from '~/utils/editorBlocks'
import { getGridItems, getGridColumns, getModuleParts, getMovableElement, layoutGrid, moveModulePart } from '~/utils/editorComposition'
import { alignSelectedText } from '~/utils/editorTextSelection'
import { setupPartDragging } from '~/utils/editorPartDrag'
import { finalizeEmailHtml } from '~/server/utils/email-compile'

vi.hoisted(() => {
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) })
})
vi.mock('~/composables/useTemplateManager', () => ({ useTemplateManager: () => ({ saveTemplate: vi.fn(), autoCreateTemplate: vi.fn() }) }))
vi.mock('~/composables/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
const state = useEditorState()
const engine = useIframeEngine()
let composition: ReturnType<typeof import('~/composables/useModuleComposition')['useModuleComposition']>
let doc: Document
let block: HTMLElement
let app: App | null = null
let dragController: AbortController | null = null

function load(id = 'grid-3') {
  doc.body.innerHTML = `<main class="main-card">${editorBlocks.find(item => item.id === id)!.content}</main>`
  block = doc.querySelector<HTMLElement>('.editable-block')!
  engine.initBlock(block, doc)
  state.selectedElement.value = block
  state.selectedSubElement.value = null
  engine.refreshLayers()
  engine.pushToHistory()
}
function selectText(element: Element, start = 0, end = element.firstChild!.textContent!.length) {
  const range = doc.createRange()
  range.setStart(element.firstChild!, start)
  range.setEnd(element.firstChild!, end)
  doc.getSelection()!.removeAllRanges()
  doc.getSelection()!.addRange(range)
  return range
}
function pointer(target: EventTarget, type: string, x = 20, y = 20) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }))
}

beforeAll(async () => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useNuxtApp', () => ({ $i18n: { t: (key: string) => key } }))
  composition = (await import('~/composables/useModuleComposition')).useModuleComposition()
})
beforeEach(() => {
  vi.useFakeTimers()
  state.resetEditorState()
  state.currentTemplate.value = 'Test composition'
  document.body.innerHTML = '<iframe></iframe>'
  state.iframeRef.value = document.querySelector('iframe')!
  doc = state.iframeRef.value.contentDocument!
  load()
})
afterEach(async () => {
  app?.unmount()
  app = null
  dragController?.abort()
  dragController = null
  await vi.dynamicImportSettled()
  engine.teardownEditor()
  state.resetEditorState()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
afterAll(() => vi.unstubAllGlobals())

describe('grid composition', () => {
  it.each(['grid-2', 'grid-3', 'grid-4'])('adds and removes items in %s without losing styles, content or table structure', id => {
    load(id)
    const items = getGridItems(block)
    const source = items[0]
    source.querySelector<HTMLElement>('[data-toggle="title"]')!.style.color = 'red'
    source.id = 'original-card'
    source.querySelector('img')!.id = 'original-image'
    composition.addGridItem(source)
    const added = getGridItems(block)
    expect(added).toHaveLength(items.length + 1)
    expect(added[0]).toBe(source)
    expect(added[1].querySelector<HTMLElement>('[data-toggle="title"]')!.style.color).toBe('red')
    expect(added[1].querySelector('[id]')).toBeNull()
    expect(state.selectedSubElement.value).toBe(added[1])
    for (const row of Array.from(block.querySelector('table')!.rows)) {
      expect(Array.from(row.cells).reduce((sum, cell) => sum + cell.colSpan, 0)).toBe(12)
      expect(Array.from(row.cells).every(cell => cell.hasAttribute('valign'))).toBe(true)
    }
    composition.removeGridItem(added[1])
    expect(getGridItems(block)).toEqual(items)
    expect(doc.querySelectorAll('#original-card')).toHaveLength(1)
  })

  it('supports undo, redo and clean export for item creation and column changes', () => {
    composition.addGridItem()
    composition.setGridColumns(2)
    expect(getGridColumns(block)).toBe(2)
    expect(block.querySelector('table')!.rows).toHaveLength(2)
    engine.undo()
    block = doc.querySelector('.editable-block')!
    expect(getGridItems(block)).toHaveLength(4)
    expect(getGridColumns(block)).toBe(3)
    engine.undo()
    block = doc.querySelector('.editable-block')!
    expect(getGridItems(block)).toHaveLength(3)
    engine.redo()
    block = doc.querySelector('.editable-block')!
    expect(getGridItems(block)).toHaveLength(4)
    const saved = new DOMParser().parseFromString(engine.getSurgicalCleanHtml(), 'text/html')
    expect(saved.querySelector('[contenteditable], [data-ignore-save], .sub-selected-focus')).toBeNull()
    expect(saved.querySelectorAll('.email-grid-table td[valign]')).toHaveLength(4)
  })

  it('keeps at least one item, enforces the limit and does not delete foreign elements', () => {
    for (let i = 0; i < 15; i++) composition.addGridItem()
    expect(getGridItems(block)).toHaveLength(12)
    composition.removeGridItem(doc.createElement('td'))
    expect(getGridItems(block)).toHaveLength(12)
    for (let i = 0; i < 15; i++) composition.removeGridItem(getGridItems(block)[0])
    expect(getGridItems(block)).toHaveLength(1)
    expect(state.selectedSubElement.value?.isConnected).toBe(true)
  })

  it('exports the edited grid and alignment without drag artifacts in the outgoing email', () => {
    composition.addGridItem()
    composition.setGridColumns(2)
    const title = getGridItems(block)[0].querySelector<HTMLElement>('[data-toggle="title"]')!
    alignSelectedText(doc, selectText(title), 'right')
    title.classList.add('tm-part-dragging')
    doc.body.classList.add('tm-reordering')
    doc.body.insertAdjacentHTML('beforeend', '<div data-ignore-save="true" class="tm-part-drop-guide">Drop here</div>')
    const html = finalizeEmailHtml(engine.getSurgicalCleanHtml())
    const exported = new DOMParser().parseFromString(html, 'text/html')
    expect(exported.querySelector('.tm-part-dragging, .tm-reordering, .tm-part-drop-guide, [contenteditable]')).toBeNull()
    expect(exported.querySelectorAll('.email-grid-table td[valign]')).toHaveLength(4)
    expect(exported.querySelector<HTMLElement>('.email-title')!.style.textAlign).toBe('right')
    expect(exported.querySelectorAll('.email-grid-table tr')).toHaveLength(2)
  })

  it('reorders items between rows while preserving node identity and nested tables', () => {
    const items = getGridItems(block)
    items[0].insertAdjacentHTML('beforeend', '<table><tbody><tr><td>Nested table</td></tr></tbody></table>')
    expect(getGridItems(block)).toHaveLength(3)
    layoutGrid(block, items, 2)
    expect(moveModulePart(block, items[2], items[0], false)).toBe(true)
    expect(getGridItems(block)).toEqual([items[2], items[0], items[1]])
    expect(items[0].querySelector('table')!.textContent).toBe('Nested table')
  })

  it('exposes working add, column and remove controls in the inspector', async () => {
    const component = (await import('~/components/editor/panels/ModuleComposition.vue')).default
    const host = document.createElement('div')
    document.body.append(host)
    app = createApp(component)
    app.config.globalProperties.$t = ((key: string) => key) as any
    app.mount(host)
    host.querySelector<HTMLButtonElement>('.composition-add')!.click()
    await nextTick()
    expect(getGridItems(block)).toHaveLength(4)
    host.querySelectorAll<HTMLButtonElement>('.composition-columns button')[1].click()
    await nextTick()
    expect(getGridColumns(block)).toBe(2)
    host.querySelector<HTMLButtonElement>('.composition-remove')!.click()
    await nextTick()
    expect(getGridItems(block)).toHaveLength(3)
    expect(host.querySelector('.composition-count')!.textContent).toBe('3 / 12')
  })
})

describe('module element movement', () => {
  it('moves semantic elements as a unit, forbids cross-container drops and supports undo', () => {
    load('hero')
    const [badge, title, subtitle, cta] = getModuleParts(block)
    title.innerHTML = '<strong>Formatted title</strong>'
    expect(getMovableElement(title.firstElementChild as HTMLElement, block)).toBe(title)
    composition.movePart(cta, -1)
    expect(getModuleParts(block)).toEqual([badge, title, cta, subtitle])
    expect(moveModulePart(block, title, cta.firstElementChild as HTMLElement, false)).toBe(false)
    engine.undo()
    expect(getModuleParts(doc.querySelector('.editable-block')!).map(part => part.dataset.toggle)).toEqual(['badge', 'title', 'subtitle', 'button-container'])
  })

  function dragSetup() {
    load('hero')
    const onChange = vi.fn()
    dragController = new AbortController()
    setupPartDragging(doc, { signal: dragController.signal, beforeChange: engine.pushToHistory, onChange, hint: 'Esc cancels' })
    return { parts: getModuleParts(block), onChange }
  }

  it('activates only after a stationary long press and commits once on release', () => {
    const { parts: [badge, title], onChange } = dragSetup()
    vi.spyOn(doc, 'elementFromPoint').mockReturnValue(title)
    pointer(badge, 'pointerdown')
    vi.advanceTimersByTime(449)
    expect(doc.querySelector('.tm-part-dragging')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(badge.classList.contains('tm-part-dragging')).toBe(true)
    pointer(doc, 'pointermove', 20, 100)
    expect(doc.querySelector('.tm-part-drop-guide')).not.toBeNull()
    pointer(doc, 'pointerup', 20, 100)
    expect(getModuleParts(block).slice(0, 2)).toEqual([title, badge])
    expect(onChange).toHaveBeenCalledOnce()
    expect(doc.querySelector('.tm-part-dragging, .tm-part-drop-guide, .tm-part-drag-hint')).toBeNull()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    title.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })

  it('preserves ordinary text-selection drags and cancels on Escape or teardown', () => {
    const { parts: [badge], onChange } = dragSetup()
    pointer(badge, 'pointerdown')
    pointer(doc, 'pointermove', 40, 20)
    vi.advanceTimersByTime(500)
    expect(doc.querySelector('.tm-part-dragging')).toBeNull()
    pointer(badge, 'pointerdown')
    vi.advanceTimersByTime(450)
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(doc.body.classList.contains('tm-reordering')).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    pointer(badge, 'pointerdown')
    dragController!.abort()
    vi.advanceTimersByTime(500)
    expect(doc.querySelector('.tm-part-dragging')).toBeNull()
  })
})

describe('floating text alignment', () => {
  it.each(['left', 'center', 'right', 'justify'] as const)('aligns a partial selection %s in a grid without affecting its neighbours', alignment => {
    const [first, second] = getGridItems(block)
    const title = first.querySelector<HTMLElement>('[data-toggle="title"]')!
    const other = second.querySelector<HTMLElement>('[data-toggle="title"]')!
    const range = selectText(title, 1, 4)
    expect(alignSelectedText(doc, range, alignment)).toBe(true)
    expect(title.style.textAlign).toBe(alignment)
    expect(other.style.textAlign).toBe('')
    expect(first.style.textAlign).toBe('')
  })

  it('aligns nested formatted paragraphs and selections across modules', () => {
    load('text')
    const title = block.querySelector('[data-toggle="title"]')!
    title.innerHTML = '<p>First <strong>formatted</strong></p><p>Second paragraph</p>'
    block.insertAdjacentHTML('afterend', '<div class="editable-block" data-type="Texto"><h4>Another module</h4></div>')
    const range = doc.createRange()
    range.setStart(title.querySelector('strong')!.firstChild!, 1)
    range.setEnd(doc.querySelector('h4')!.firstChild!, 6)
    alignSelectedText(doc, range, 'right')
    expect([...doc.querySelectorAll<HTMLElement>('p, h4')].every(el => el.style.textAlign === 'right')).toBe(true)
    expect(block.style.textAlign).toBe('')
  })

  it('applies toolbar alignment, keeps selection and restores it after a link dialog', () => {
    load('hero')
    engine.injectFloatingToolbar(doc)
    const title = block.querySelector<HTMLElement>('[data-toggle="title"]')!
    selectText(title, 0, 5)
    const text = doc.getSelection()!.toString()
    doc.querySelector<HTMLButtonElement>('[data-align="center"]')!.click()
    expect(title.style.textAlign).toBe('center')
    expect(doc.getSelection()!.toString()).toBe(text)
    let callback: (url: string) => void = () => {}
    ;(window as any).openLinkPrompt = (value: typeof callback) => { callback = value }
    const command = vi.fn()
    Object.defineProperty(doc, 'execCommand', { configurable: true, value: command })
    doc.querySelector<HTMLButtonElement>('[data-cmd="createLink"]')!.click()
    doc.getSelection()!.removeAllRanges()
    callback('https://example.com')
    expect(doc.getSelection()!.toString()).toBe(text)
    expect(command).toHaveBeenCalledWith('createLink', false, 'https://example.com')
    delete (window as any).openLinkPrompt
    engine.undo()
    expect(doc.querySelector<HTMLElement>('[data-toggle="title"]')!.style.textAlign).toBe('')
  })

  it('aligns button text without changing the surrounding module', () => {
    load('hero')
    const button = block.querySelector<HTMLElement>('[data-toggle="button"]')!
    alignSelectedText(doc, selectText(button), 'left')
    expect(button.style.textAlign).toBe('left')
    expect(block.style.textAlign).toBe('center')
  })
})
