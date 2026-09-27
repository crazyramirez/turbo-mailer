// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useEditorState } from '~/composables/useEditorState'
import { useIframeEngine } from '~/composables/useIframeEngine'
import { usePrompt } from '~/composables/usePrompt'
import { editorBlocks } from '~/utils/editorBlocks'

const mocks = vi.hoisted(() => {
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value) },
  })
  return { showToast: vi.fn(), saveTemplate: vi.fn() }
})
vi.mock('~/composables/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))
vi.mock('~/composables/useTemplateManager', () => ({ useTemplateManager: () => ({ saveTemplate: mocks.saveTemplate }) }))

const state = useEditorState()
const engine = useIframeEngine()
const prompt = usePrompt()
let editor: ReturnType<typeof import('~/composables/useBlockEditor')['useBlockEditor']>
let doc: Document

function nativeBlock(id: string): HTMLElement {
  doc.body.innerHTML = editorBlocks.find(block => block.id === id)!.content
  return doc.body.firstElementChild as HTMLElement
}

function buttons(block: HTMLElement): HTMLAnchorElement[] {
  return [...block.querySelectorAll<HTMLAnchorElement>('[data-toggle="button"]')]
}

async function confirm(value: string) {
  state.promptData.value = value
  prompt.submitPrompt()
  await vi.dynamicImportSettled()
}

describe('individual buttons inside campaign modules', () => {
  beforeAll(async () => {
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('useNuxtApp', () => ({ $i18n: { t: (key: string) => key } }))
    editor = (await import('~/composables/useBlockEditor')).useBlockEditor()
  })

  beforeEach(() => {
    vi.useFakeTimers()
    state.resetEditorState()
    state.htmlContent.value = ''
    state.fontSizeRef.value = 16
    state.selectionBaseRef.value = 16
    state.promptData.visible = false
    state.layoutTrigger.value = 0
    mocks.showToast.mockClear()
    mocks.saveTemplate.mockClear()
    document.body.innerHTML = '<iframe></iframe>'
    state.iframeRef.value = document.querySelector('iframe')!
    doc = state.iframeRef.value.contentDocument!
  })

  afterEach(async () => {
    await vi.dynamicImportSettled()
    engine.teardownEditor()
    state.resetEditorState()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  afterAll(() => vi.unstubAllGlobals())

  it('loads controls from the button document, including stylesheet values and zero radius/padding', () => {
    const block = nativeBlock('hero')
    const [button] = buttons(block)
    button!.style.removeProperty('border-radius')
    button!.style.removeProperty('font-size')
    button!.style.removeProperty('padding')
    doc.head.innerHTML = '<style>[data-toggle="button"] { border-radius: 0; padding: 0 27px; font-size: 23px; }</style>'
    const computed = vi.spyOn(doc.defaultView!, 'getComputedStyle')

    editor.selectElement(block, button, true)

    expect(computed).toHaveBeenCalledWith(button)
    expect(state.buttonRadiusRef.value).toBe(0)
    expect(state.buttonPaddingXRef.value).toBe(27)
    expect(state.buttonPaddingYRef.value).toBe(0)
    expect(state.buttonFontSizeRef.value).toBe(23)
    editor.selectElement(block, undefined, true)
    expect(state.selectedSubElement.value).toBeNull()
  })

  it('edits and persists a plain-text Hero CTA without altering its anchor or surrounding content', async () => {
    const block = nativeBlock('hero')
    const [button] = buttons(block)
    button!.setAttribute('contenteditable', 'false')
    button!.href = 'https://example.com/original'
    const originalBackground = button!.style.background
    const title = block.querySelector('[data-toggle="title"]')!.outerHTML
    editor.selectElement(block, button, true)
    editor.updateThisButtonText()
    expect(state.promptData.title).toBe('editor.btn_text_title')
    await confirm('Más información <ahora>')
    editor.updateThisButtonFontSize(24)
    state.buttonPaddingXRef.value = 48
    state.buttonPaddingYRef.value = 16
    editor.updateThisButtonPadding()
    state.buttonRadiusRef.value = 0
    editor.updateThisButtonRadius()
    editor.updateButtonLink()
    await confirm('https://example.com/informacion')

    const saved = new DOMParser().parseFromString(state.htmlContent.value, 'text/html')
    const savedButton = saved.querySelector<HTMLAnchorElement>('[data-toggle="button"]')!
    expect(savedButton.textContent).toBe('Más información <ahora>')
    expect(savedButton.querySelector('ahora')).toBeNull()
    expect(savedButton.getAttribute('href')).toBe('https://example.com/informacion')
    expect(savedButton.style.fontSize).toBe('24px')
    expect(savedButton.style.padding).toBe('16px 48px')
    expect(savedButton.style.borderRadius).toBe('0px')
    expect(savedButton.style.background).toBe(originalBackground)
    expect(savedButton.hasAttribute('contenteditable')).toBe(false)
    expect(savedButton.hasAttribute('data-org-size')).toBe(false)
    expect(block.querySelector('[data-toggle="button"]')).toBe(button)
    expect(block.querySelector('[data-toggle="title"]')!.outerHTML).toContain('Eleva tu marca')
    expect(block.querySelector('[data-toggle="title"]')!.getAttribute('style')).toBe(new DOMParser().parseFromString(title, 'text/html').body.firstElementChild!.getAttribute('style'))
    expect(localStorage.getItem('editor_html_draft')).toBe(state.htmlContent.value)
    expect(state.undoStack.value.length).toBeGreaterThan(0)
    expect(state.layoutTrigger.value).toBe(1)
  })

  it('applies all individual controls only to the chosen pricing CTA and its styled label', async () => {
    const block = nativeBlock('pricing')
    const [first, selected, third] = buttons(block)
    selected!.innerHTML = '<span style="font-size:19px;color:#ff0000"><strong style="font-size:19px;color:#ff0000">Plan Pro</strong></span>'
    editor.selectElement(block, selected!.querySelector('strong')!, true)
    expect(state.buttonFontSizeRef.value).toBe(19)
    const untouchedButtons = [first!.outerHTML, third!.outerHTML]
    const headings = [...block.querySelectorAll('[data-toggle="title"]')].map(el => el.outerHTML)

    editor.updateThisButtonFontSize('22')
    state.buttonPaddingXRef.value = 30
    state.buttonPaddingYRef.value = 10
    editor.updateThisButtonPadding()
    state.buttonRadiusRef.value = 4
    editor.updateThisButtonRadius()
    editor.updateThisButtonColor()
    await confirm('#123456')
    editor.updateThisButtonTextColor()
    expect(state.promptData.title).toBe('editor.color_text_title')
    expect(state.promptData.colorTarget).toBe('')
    // Typing in this prompt must never dispatch the module-wide text preview.
    prompt.handlePromptInput('#abcdef')
    await vi.dynamicImportSettled()
    await confirm('#abcdef')
    editor.updateButtonLink()
    await confirm('mailto:ventas@example.com')
    editor.updateThisButtonText()
    await confirm('Elegir Pro')

    expect([first!.outerHTML, third!.outerHTML]).toEqual(untouchedButtons)
    expect([...block.querySelectorAll('[data-toggle="title"]')].map(el => el.outerHTML)).toEqual(headings)
    expect(selected!.style.fontSize).toBe('22px')
    expect(selected!.querySelector('span')!.style.fontSize).toBe('22px')
    expect(selected!.querySelector('strong')!.style.color).toBe('#abcdef')
    expect(selected!.style.padding).toBe('10px 30px')
    expect(selected!.style.borderRadius).toBe('4px')
    expect(selected!.style.background).toBe('#123456')
    expect(selected!.getAttribute('href')).toBe('mailto:ventas@example.com')
    expect(selected!.textContent).toBe('Elegir Pro')
    expect(state.htmlContent.value).toContain('Elegir Pro')
  })

  it('keeps label markup and neighboring icons when replacing button text', async () => {
    const block = nativeBlock('hero')
    const [button] = buttons(block)
    button!.innerHTML = '<svg aria-hidden="true"><title>Arrow</title><path d="M0 0h5"/></svg><span class="btn-text" style="font-weight:800">Leer <strong>más</strong></span><img src="/arrow.png" alt="">'
    const span = button!.querySelector('span')!
    const icon = button!.querySelector('svg')!
    const image = button!.querySelector('img')!
    editor.selectElement(block, span, true)
    editor.updateThisButtonText()
    expect(state.promptData.value).toBe('Leer más')
    await confirm('Más información')
    expect(span.textContent).toBe('Más información')
    expect(span.style.fontWeight).toBe('800')
    expect(button!.querySelector('svg')).toBe(icon)
    expect(button!.querySelector('img')).toBe(image)
    expect(icon.querySelector('title')!.textContent).toBe('Arrow')
  })

  it('retains the individual font size when the module is scaled again', async () => {
    const block = nativeBlock('hero')
    const [button] = buttons(block)
    editor.selectElement(block, button, true)
    const base = state.selectionBaseRef.value
    editor.updateFontSize(base * 1.5)
    expect(state.buttonFontSizeRef.value).toBe(27)
    editor.updateThisButtonFontSize(25)
    editor.updateFontSize(base * 1.5)
    expect(button!.style.fontSize).toBe('25px')
    editor.updateFontSize(base * 1.8)
    expect(button!.style.fontSize).toBe('30px')
    expect(state.buttonFontSizeRef.value).toBe(30)
    expect(state.selectionBaseRef.value).toBe(base)
    editor.selectElement(block, button, true)
    editor.updateFontSize(state.selectionBaseRef.value)
    expect(button!.style.fontSize).toBe('30px')
    editor.updateFontSize(state.selectionBaseRef.value * 1.2)
    expect(button!.style.fontSize).toBe('36px')
    expect(state.buttonFontSizeRef.value).toBe(36)
    await vi.dynamicImportSettled()
  })

  it.each(['javascript:alert(1)', 'data:text/html,bad', 'vbscript:bad()'])('rejects executable button links: %s', async url => {
    const block = nativeBlock('hero')
    const [button] = buttons(block)
    button!.setAttribute('href', 'https://example.com/safe')
    editor.selectElement(block, button, true)
    editor.updateButtonLink()
    await confirm(url)
    expect(button!.getAttribute('href')).toBe('https://example.com/safe')
    expect(mocks.showToast).toHaveBeenCalledWith('editor.invalid_link', 'error')
  })

  it('does not edit a stale button from a different module or choose one implicitly', async () => {
    const block = nativeBlock('hero')
    const [button] = buttons(block)
    const other = doc.createElement('div')
    doc.body.appendChild(other)
    const original = button!.outerHTML
    editor.selectElement(other, button, true)
    editor.updateThisButtonFontSize(30)
    editor.updateThisButtonPadding()
    editor.updateThisButtonText()
    editor.updateButtonLink()
    expect(button!.outerHTML).toBe(original)
    expect(state.promptData.visible).toBe(false)
    editor.selectElement(block, undefined, true)
    editor.updateThisButtonFontSize(30)
    expect(button!.style.fontSize).toBe('18px')
    await vi.dynamicImportSettled()
    expect(state.htmlContent.value).toBe('')
  })
})
