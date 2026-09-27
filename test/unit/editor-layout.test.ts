// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { editorBlocks } from '~/utils/editorBlocks'
import { editorStyleBases, getReadableTextColor } from '~/utils/editorStyles'
import { applyStyleToDocument, assembleEmail } from '~/utils/emailAssembler'
import { annotateEmailLayout, EDITOR_RESPONSIVE_CSS } from '~/utils/emailLayout'
import { iframeEditorStyles } from '~/utils/iframeStyles'
import { finalizeEmailHtml } from '~/server/utils/email-compile'

const nativeHtml = (ids: string[], editing = false) => `<html><head><style>${EDITOR_RESPONSIVE_CSS}</style>${editing ? `<style>${iframeEditorStyles}</style>` : ''}</head><body><div class="main-card">${editorBlocks.filter(block => ids.includes(block.id)).map(block => block.content).join('')}</div></body></html>`
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

describe('native and exported email layout', () => {
  it('stacks manual grid, pricing, product and metric cards without requiring AI classes', async () => {
    const mobile = new Window({ width: 375 })
    try {
      mobile.document.write(nativeHtml(['grid-2', 'grid-3', 'pricing', 'product', 'metrics']))
      const cells = mobile.document.querySelectorAll('td[valign]')
      expect(cells).toHaveLength(13)
      for (const cell of cells) {
        expect(mobile.getComputedStyle(cell).display).toBe('block')
        expect(mobile.getComputedStyle(cell).width).toBe('100%')
      }
      for (const spacer of mobile.document.querySelectorAll('.grid-block td:not([valign]), .pricing-block td[width="3.5%"]')) {
        expect(mobile.getComputedStyle(spacer).display).toBe('none')
      }
      expect(mobile.document.querySelector('[class*="ai-layout"]')).toBeNull()
    } finally { await mobile.happyDOM.close() }
  })

  it('uses pairs for Grid Quad on phones and one card per row on very narrow screens', async () => {
    for (const [width, expected] of [[375, '50%'], [320, '100%']] as const) {
      const mobile = new Window({ width })
      try {
        mobile.document.write(nativeHtml(['grid-4']))
        for (const cell of mobile.document.querySelectorAll('.grid-quad-td')) {
          expect(mobile.getComputedStyle(cell).width).toBe(expected)
        }
      } finally { await mobile.happyDOM.close() }
    }
  })

  it('keeps the same native image heights in the editor and exported HTML', async () => {
    for (const width of [375, 820]) {
      const exported = new Window({ width })
      const editing = new Window({ width })
      try {
        exported.document.write(nativeHtml(['grid-2', 'grid-3', 'grid-4', 'image']))
        editing.document.write(nativeHtml(['grid-2', 'grid-3', 'grid-4', 'image'], true))
        const images = exported.document.querySelectorAll('img')
        const editorImages = editing.document.querySelectorAll('img')
        expect(images).toHaveLength(editorImages.length)
        images.forEach((image, index) => {
          expect(editing.getComputedStyle(editorImages[index]).height).toBe(exported.getComputedStyle(image).height)
        })
        const grids = exported.document.querySelectorAll('.grid-img')
        expect(exported.getComputedStyle(grids[0]).height).toBe('200px')
        expect(exported.getComputedStyle(grids[2]).height).toBe('150px')
        expect(exported.getComputedStyle(grids[5]).height).toBe('120px')
        expect(exported.getComputedStyle(exported.document.querySelector('.image-block img')!).height).toBe('auto')
      } finally {
        await exported.happyDOM.close()
        await editing.happyDOM.close()
      }
    }
  })

  it('contains long text, coupon codes, buttons and tables after editor-only classes are removed', async () => {
    const view = new Window({ width: 320 })
    try {
      view.document.write(finalizeEmailHtml(nativeHtml(editorBlocks.map(block => block.id))).replaceAll(' editable-block', ''))
      for (const block of view.document.querySelectorAll('.email-block')) {
        expect(view.getComputedStyle(block).overflowWrap).toBe('anywhere')
      }
      for (const table of view.document.querySelectorAll('.email-layout-table')) {
        expect(view.getComputedStyle(table).tableLayout).toBe('fixed')
      }
      const code = view.document.querySelector('.email-code')!
      expect(view.getComputedStyle(code).maxWidth).toBe('100%')
      expect(view.getComputedStyle(code).boxSizing).toBe('border-box')
      expect(view.document.querySelector('[data-toggle]')).toBeNull()
      for (const button of view.document.querySelectorAll('.email-button')) {
        expect(view.getComputedStyle(button).minWidth).toBe('0')
        expect(view.getComputedStyle(button).whiteSpace).toBe('normal')
        expect(view.getComputedStyle(button).paddingLeft).toBe('0px')
        expect(parseFloat(view.getComputedStyle(button.closest('td')!).paddingLeft)).toBeGreaterThan(0)
      }
    } finally { await view.happyDOM.close() }
  })

  it('annotates legacy blocks without treating already compiled button tables as columns', () => {
    const doc = parse('<div class="pricing-block editable-block" data-type="Precios"><table><tr><td valign="top"><div data-toggle="title">Plan</div><table data-tm-btn="1"><tr><td><a data-toggle="button">Elegir</a></td></tr></table></td></tr></table></div>')
    const block = doc.querySelector<HTMLElement>('.pricing-block')!
    annotateEmailLayout(block)
    annotateEmailLayout(block)
    expect(block.classList.contains('email-block')).toBe(true)
    expect(block.querySelectorAll('.email-pricing-table')).toHaveLength(1)
    expect(block.querySelectorAll('.email-title')).toHaveLength(1)
    expect(block.querySelectorAll('.email-button')).toHaveLength(1)
    expect(block.querySelector('[data-tm-btn]')?.classList.contains('email-layout-table')).toBe(false)
  })
})

describe('email theme legibility', () => {
  it('keeps all bundled theme text, links and button labels at a readable contrast', () => {
    const luminance = (hex: string) => hex.slice(1).match(/../g)!.map(channel => {
      const value = parseInt(channel, 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
    const contrast = (first: string, second: string) => {
      const a = luminance(first), b = luminance(second)
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    for (const { id, config } of editorStyleBases) {
      for (const color of [config.titleColor, config.subtitleColor, config.accentColor]) {
        expect(contrast(config.contentBg, color), `${id} ${color} on ${config.contentBg}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(config.headerBg, config.headerText), `${id} header`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(config.accentColor, getReadableTextColor(config.accentColor)), `${id} button`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps a photographic hero image and light text when applying every theme', () => {
    for (const style of editorStyleBases) {
      const doc = parse(nativeHtml(['hero']))
      const hero = doc.querySelector<HTMLElement>('.hero-block')!
      // happy-dom does not parse layered gradients; exercise a retained real photo.
      hero.style.backgroundImage = 'url("https://example.com/hero.jpg")'
      const image = hero.style.backgroundImage
      applyStyleToDocument(doc, style.id)
      expect(hero.style.backgroundImage).toBe(image)
      expect(hero.querySelector<HTMLElement>('[data-toggle="title"]')!.style.color).toBe('#ffffff')
      expect(hero.querySelector<HTMLElement>('[data-toggle="subtitle"]')!.style.color).toBe('#e2e8f0')
    }
  })

  it('gives an image-free hero and the legal footer matching theme backgrounds and text', async () => {
    for (const style of editorStyleBases) {
      const doc = parse(await assembleEmail({ styleId: style.id, blocks: [{ id: 'hero', fields: { title: 'Un mensaje claro' } }] }))
      const hero = doc.querySelector<HTMLElement>('.hero-block')!
      const footer = doc.querySelector<HTMLElement>('.unsubscribe-block')!
      expect(hero.style.backgroundColor).toBe(style.config.headerBg)
      expect(hero.querySelector<HTMLElement>('[data-toggle="title"]')!.style.color).toBe(style.config.headerText)
      expect(footer.style.backgroundColor).toBe(style.config.contentBg)
      expect(footer.querySelector<HTMLElement>('[data-toggle="subtitle"]')!.style.color).toBe(style.config.subtitleColor)
      expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe('width=device-width, initial-scale=1')
    }
  })

  it('uses dark lettering on bright brand/gold buttons and light lettering on dark buttons', async () => {
    expect(getReadableTextColor('#f59e0b')).toBe('#0f172a')
    expect(getReadableTextColor('#fff')).toBe('#0f172a')
    expect(getReadableTextColor('rgb(245, 158, 11)')).toBe('#0f172a')
    expect(getReadableTextColor('#1e293b')).toBe('#ffffff')
    const doc = parse(await assembleEmail({ styleId: 'default', brand: { colors: { primary: '#ffff00' } }, blocks: [{ id: 'button', fields: { button: 'Un botón legible', buttonUrl: 'https://example.com' } }] }))
    const button = doc.querySelector<HTMLElement>('[data-toggle="button"]')!
    expect(button.style.color).toBe('#0f172a')
    expect(button.style.backgroundColor).toBe('#ffff00')
  })
})
