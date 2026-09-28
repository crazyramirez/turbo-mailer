// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { assembleEmail } from '~/utils/emailAssembler'
import { useEditorState } from '~/composables/useEditorState'
import { useIframeEngine } from '~/composables/useIframeEngine'

vi.hoisted(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
})

const engine = useIframeEngine()
const state = useEditorState()

async function loadCampaign(id: string) {
  const html = await assembleEmail({ styleId: 'midnight-gold', blocks: [{ id, fields: {
    title: ['Experiencias digitales', 'Plan profesional', 'Plan empresa'],
    button: ['Más información', 'Solicitar propuesta', 'Contactar'],
    buttonUrl: ['https://example.com/info', 'https://example.com/pro', 'https://example.com/contact'],
  } }] })
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML
  document.querySelectorAll<HTMLElement>('.editable-block').forEach(block => engine.initBlock(block, document))
  engine.setupIframeEvents(document)
  return document.querySelector<HTMLElement>(`[data-ai-block-id="${id}"]`)!
}

async function click(target: HTMLElement) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  await vi.dynamicImportSettled()
  return event
}

describe('selecting buttons inside generated modules', () => {
  beforeEach(() => {
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('useNuxtApp', () => ({ $i18n: { t: (key: string) => key } }))
    state.resetEditorState()
    state.activePanel.value = 'layers'
    state.imageModal.visible = false
  })
  afterEach(() => {
    engine.teardownEditor()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it.each(['hero', 'button', 'product', 'pricing'])('selects every %s CTA and prevents navigation', async (id) => {
    const block = await loadCampaign(id)
    const buttons = block.querySelectorAll<HTMLElement>('[data-toggle="button"]')
    expect(buttons).toHaveLength(id === 'pricing' ? 3 : 1)
    for (const button of buttons) {
      const event = await click(button)
      expect(event.defaultPrevented).toBe(true)
      expect(state.selectedElement.value).toBe(block)
      expect(state.selectedSubElement.value).toBe(button)
      expect(state.activePanel.value).toBe('edit')
    }
    expect(document.getElementById('pricing-inline-toolbar')).toBeNull()
  })

  it('selects a pricing button through its formatted label and hides the card toolbar', async () => {
    const block = await loadCampaign('pricing')
    const item = block.querySelector<HTMLElement>('.pricing-item')!
    await click(item.querySelector<HTMLElement>('[data-toggle="title"]')!)
    expect(state.selectedSubElement.value).toBe(item)
    const toolbar = document.getElementById('pricing-inline-toolbar')!
    expect(toolbar.style.display).toBe('flex')

    const button = item.querySelector<HTMLElement>('[data-toggle="button"]')!
    button.innerHTML = '<span><strong>Más información</strong></span>'
    await click(button.querySelector<HTMLElement>('strong')!)
    expect(state.selectedElement.value).toBe(block)
    expect(state.selectedSubElement.value).toBe(button)
    expect(toolbar.style.display).toBe('none')

    await click(item.querySelector<HTMLElement>('[data-toggle="title"]')!)
    expect(state.selectedSubElement.value).toBe(item)
    expect(toolbar.style.display).toBe('flex')
  })

  it('keeps a linked button image attached to the button controls', async () => {
    const block = await loadCampaign('hero')
    const button = block.querySelector<HTMLElement>('[data-toggle="button"]')!
    button.innerHTML = '<img src="/uploads/cta.png" alt="Más información">'
    await click(button.querySelector<HTMLElement>('img')!)
    expect(state.selectedElement.value).toBe(block)
    expect(state.selectedSubElement.value).toBe(button)
    expect(state.imageModal.visible).toBe(false)
  })
})
