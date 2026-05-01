import { useEditorState } from '~/composables/useEditorState'
import { usePrompt } from '~/composables/usePrompt'
import { useToast } from '~/composables/useToast'
import { rgbToHex } from '~/utils/editorColors'

const {
  iframeRef,
  selectedElement,
  selectedSubElement,
  activePanel,
  fontSizeRef,
  selectionBaseRef,
  logoWidthRef,
  gridImageHeightRef,
  imageHeightRef,
  buttonRadiusRef,
  borderWidthRef,
  borderColorRef,
  visibilityTrigger,
  layoutTrigger,
  originalFontBeforePreview,
  originalColorBeforePreview,
  editorDragState,
  isSidebarDragging,
  isLayerDragging,
  layerList,
  imageModal,
  currentStyle,
} = useEditorState()

const { openPrompt } = usePrompt()
const { showToast } = useToast()

const isImprovingAI = ref(false)

// ─── Selection ───────────────────────────────────────────────────────────────

function selectElement(el: HTMLElement, subEl?: HTMLElement, skipScroll = false) {
  if (selectedElement.value) selectedElement.value.classList.remove('selected')
  
  selectedElement.value = el
  selectedSubElement.value = subEl || null
  el.classList.add('selected')

  if (el.dataset.type === 'Header') {
    const img = el.querySelector("[data-toggle='logo'] img") as HTMLElement
    if (img) {
      const w = parseInt(img.style.width) || img.offsetWidth || 150
      logoWidthRef.value = w
    }
  }

  if (el.dataset.type === 'Grid') {
    const firstImg = (el.querySelector("img.grid-img") || el.querySelector("[data-toggle='image'] img") || el.querySelector("td img")) as HTMLImageElement
    if (firstImg) {
      const h = parseInt(firstImg.style.height) || firstImg.offsetHeight || 150
      gridImageHeightRef.value = h
    }
  }

  if (el.dataset.type === 'Imagen' || el.dataset.type === 'Tarjeta') {
    const firstImg = el.querySelector("[data-toggle='image'] img") as HTMLImageElement
    if (firstImg) {
      const h = parseInt(firstImg.style.height) || firstImg.offsetHeight || 300
      imageHeightRef.value = h
    }
  }

  if (subEl?.closest('[data-toggle="button"]')) {
    const btn = subEl.closest('[data-toggle="button"]') as HTMLElement
    buttonRadiusRef.value = parseInt(btn.style.borderRadius) || 8
  }

  activePanel.value = 'edit'
  if (!skipScroll) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const elements = el.querySelectorAll('div, p, span, h1, h2, h3, td, b, strong, i, u, font, em')
  if (elements.length > 0) {
    const firstEl = elements[0] as HTMLElement
    const firstSize = parseInt(window.getComputedStyle(firstEl).fontSize) || 16
    fontSizeRef.value = firstSize
    selectionBaseRef.value = firstSize

    elements.forEach((child: any) => {
      if (!child.dataset.orgSize) {
        child.dataset.orgSize = parseInt(window.getComputedStyle(child).fontSize) || 16
      }
    })
  }

  // Border initialization
  const borderStyle = window.getComputedStyle(el)
  borderWidthRef.value = parseInt(borderStyle.borderWidth) || 0
  borderColorRef.value = rgbToHex(borderStyle.borderColor) || '#e9e9e9'
}

function deselect() {
  if (selectedElement.value) selectedElement.value.classList.remove('selected')
  selectedElement.value = null
  selectedSubElement.value = null
  activePanel.value = 'layers'

  const doc = iframeRef.value?.contentDocument
  if (doc) {
    doc.getSelection()?.removeAllRanges()
    const toolbar = doc.getElementById('floating-toolbar')
    if (toolbar) toolbar.style.display = 'none'
  }
}

function switchToEditPanel() {
  const doc = iframeRef.value?.contentDocument

  if (!selectedElement.value && doc) {
    const sel = doc.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      const targetElement = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
      if (targetElement) {
        const block = targetElement.closest('.editable-block') as HTMLElement
        const sub = targetElement.closest(
          '[data-toggle="title"], [data-toggle="subtitle"], [data-toggle="badge"], [data-toggle="image"], [data-toggle="button"], [data-toggle="ps"], [data-toggle="contact"]',
        ) as HTMLElement
        if (block) {
          selectElement(block, sub || undefined)
          return
        }
      }
    }
    const firstBlock = doc?.querySelector('.editable-block') as HTMLElement
    if (firstBlock) {
      selectElement(firstBlock)
      return
    }
  }

  activePanel.value = 'edit'
}

// ─── Block Operations ────────────────────────────────────────────────────────

function deleteSelectedBlock() {
  if (!selectedElement.value) return
  const el = selectedElement.value
  el.classList.add('module-remove-reveal')

  setTimeout(() => {
    el.remove()
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
      useIframeEngine().refreshLayers()
      useIframeEngine().triggerAutosave(true)
    })
  }, 380)

  deselect()
}

function moveLayer(index: number, direction: 'up' | 'down') {
  const el = layerList.value[index].el
  if (direction === 'up' && el.previousElementSibling) el.parentNode?.insertBefore(el, el.previousElementSibling)
  else if (direction === 'down' && el.nextElementSibling) el.nextElementSibling.after(el)

  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

// ─── Visibility Toggles ──────────────────────────────────────────────────────

function toggleVisibility(type: string) {
  if (!selectedElement.value) return
  const elements = selectedElement.value.querySelectorAll(`[data-toggle="${type}"]`)
  if (elements.length > 0) {
    const isHidden = (elements[0] as HTMLElement).style.display === 'none'
    elements.forEach((el) => ((el as HTMLElement).style.display = isHidden ? '' : 'none'))
    visibilityTrigger.value++
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
      useIframeEngine().triggerAutosave(true)
    })
  }
}

function isVisible(type: string): boolean {
  const _ = visibilityTrigger.value
  if (!selectedElement.value) return true
  const el = selectedElement.value.querySelector(`[data-toggle="${type}"]`) as HTMLElement
  return el ? el.style.display !== 'none' : true
}

// ─── Layout Controls ─────────────────────────────────────────────────────────

function toggleCardLayout() {
  if (!selectedElement.value || selectedElement.value.dataset.type !== 'Tarjeta') return
  const current = selectedElement.value.getAttribute('data-layout') || 'premium'
  const next = current === 'premium' ? 'standard' : 'premium'
  selectedElement.value.setAttribute('data-layout', next)

  const wrapper = selectedElement.value.querySelector('.card-wrapper') as HTMLElement
  const badge = selectedElement.value.querySelector('.badge-el') as HTMLElement
  if (next === 'standard') {
    if (wrapper) wrapper.style.padding = '24px'
    if (badge) badge.style.display = 'none'
  } else {
    if (wrapper) wrapper.style.padding = '20px'
    if (badge) badge.style.display = ''
  }
  layoutTrigger.value++
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().triggerAutosave(true)
  })
}

function getCardLayout(): string {
  const _ = layoutTrigger.value
  return selectedElement.value?.getAttribute('data-layout') || 'premium'
}

function toggleButtonLayout() {
  if (!selectedElement.value || selectedElement.value.dataset.type !== 'Botón') return
  const current = selectedElement.value.getAttribute('data-layout') || 'auto'
  const next = current === 'auto' ? 'full' : 'auto'
  selectedElement.value.setAttribute('data-layout', next)

  const row = selectedElement.value.querySelector('.buttons-row') as HTMLElement
  if (row) {
    row.style.textAlign = 'center'
    row.setAttribute('align', 'center')
  }

  selectedElement.value.querySelectorAll('[data-toggle="button"]').forEach((b) => {
    ;(b as HTMLElement).style.display = next === 'full' ? 'block' : 'inline-block'
    ;(b as HTMLElement).style.width = next === 'full' ? '100%' : 'auto'
    ;(b as HTMLElement).style.boxSizing = 'border-box'
    ;(b as HTMLElement).style.maxWidth = next === 'full' ? '100%' : 'none'
  })

  layoutTrigger.value++
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().triggerAutosave(true)
  })
}

function getButtonLayout(): string {
  const _ = layoutTrigger.value
  return selectedElement.value?.getAttribute('data-layout') || 'auto'
}

// ─── Styling ─────────────────────────────────────────────────────────────────

function previewBlockColor(color: string) {
  if (!selectedElement.value || !color) return
  const isCompleteHex = /^#([0-9A-F]{3}){1,2}$/i.test(color)
  const isTransparent = color.toLowerCase() === 'transparent'
  if (isCompleteHex || isTransparent) {
    selectedElement.value.style.backgroundColor = color
    selectedElement.value.style.background = color
    selectedElement.value.dataset.customBg = 'true'
  }
}

function previewTextColor(color: string) {
  if (!selectedElement.value || !color) return
  const isCompleteHex = /^#([0-9A-F]{3}){1,2}$/i.test(color)
  const isInherit = color.toLowerCase() === 'inherit' || color.toLowerCase() === 'transparent'
  
  if (isCompleteHex || isInherit) {
    const finalColor = isInherit ? 'inherit' : color
    
    // Check if there's a selection in the iframe
    const doc = iframeRef.value?.contentDocument
    const win = doc?.defaultView
    const selection = win?.getSelection()
    
    if (selection && !selection.isCollapsed && doc) {
      // Apply color only to selection
      doc.execCommand('styleWithCSS', false, 'true')
      doc.execCommand('foreColor', false, finalColor)
    } else {
      // Apply to the whole block
      selectedElement.value.style.color = finalColor
      selectedElement.value.querySelectorAll('div, p, span, td, h1, h2, h3, b, strong, a').forEach((el: any) => {
        el.style.color = finalColor
      })
    }
  }
}

function previewBorderColor(color: string) {
  if (!selectedElement.value || !color) return
  const isCompleteHex = /^#([0-9A-F]{3}){1,2}$/i.test(color)
  const isTransparent = color.toLowerCase() === 'transparent'
  if (isCompleteHex || isTransparent) {
    selectedElement.value.style.borderColor = color
  }
}

function updateBgColor() {
  if (!selectedElement.value) return
  const current = rgbToHex(selectedElement.value.style.backgroundColor || 'transparent')
  originalColorBeforePreview.value = current
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(i18n.t('editor.color_bg_title'), i18n.t('editor.color_bg_label'), current, 'color', (val) => {
    if (val) {
      previewBlockColor(val)
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
    } else {
      previewBlockColor(originalColorBeforePreview.value)
    }
  }, 'primary', undefined, 'block')
}

function updateTextColor() {
  if (!selectedElement.value) return
  const current = rgbToHex(selectedElement.value.style.color || 'inherit')
  originalColorBeforePreview.value = current
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(i18n.t('editor.color_text_title'), i18n.t('editor.color_text_label'), current, 'color', (val) => {
    if (val) {
      previewTextColor(val)
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
    } else {
      previewTextColor(originalColorBeforePreview.value)
    }
  }, 'primary', undefined, 'text')
}

function updateFont() {
  if (!selectedElement.value) return
  originalFontBeforePreview.value = selectedElement.value.style.fontFamily || 'Arial'
  activePanel.value = 'fonts'
}

function previewFont(family: string) {
  if (!selectedElement.value) return
  selectedElement.value.style.fontFamily = family
  selectedElement.value.querySelectorAll('div, p, span, td, a').forEach((el: any) => (el.style.fontFamily = family))
}

function cancelFontSelection() {
  if (selectedElement.value) {
    selectedElement.value.style.fontFamily = originalFontBeforePreview.value
    selectedElement.value
      .querySelectorAll('div, p, span, td, a')
      .forEach((el: any) => (el.style.fontFamily = originalFontBeforePreview.value))
  }
  activePanel.value = 'edit'
}

function applyFont(family: string) {
  if (!selectedElement.value) return
  selectedElement.value.style.fontFamily = family
  selectedElement.value.querySelectorAll('div, p, span, td, a').forEach((el: any) => (el.style.fontFamily = family))
  activePanel.value = 'edit'
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave())
}

function updateTextAlign(align: string) {
  if (!selectedElement.value) return
  selectedElement.value.style.textAlign = align
  selectedElement.value.querySelectorAll('div, p, span, td, h1, h2, h3').forEach((el: any) => {
    el.style.textAlign = align
  })
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function getTextAlign(): string {
  return selectedElement.value?.style.textAlign || 'left'
}

function updateFontSize(val: number | string) {
  if (!selectedElement.value) return
  const newSize = typeof val === 'string' ? parseInt(val) : val
  fontSizeRef.value = newSize
  const ratio = newSize / selectionBaseRef.value
  selectedElement.value.querySelectorAll('div, p, span, h1, h2, td, b, strong, a').forEach((el: any) => {
    const original = parseInt(el.dataset.orgSize) || 16
    const finalSize = Math.max(8, Math.min(Math.round(original * ratio), 60))
    el.style.fontSize = finalSize + 'px'
    el.style.lineHeight = Math.round(finalSize * 1.5) + 'px'
  })
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave())
}

function updateLogoWidth(val: number | string) {
  if (!selectedElement.value) return
  const newWidth = typeof val === 'string' ? parseInt(val) : val
  logoWidthRef.value = newWidth
  const img = selectedElement.value.querySelector("[data-toggle='logo'] img") as HTMLImageElement
  if (img) {
    img.style.width = newWidth + 'px'
    img.setAttribute('width', newWidth.toString())
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.maxHeight = 'none'
  }
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function updateGridImageHeight(val?: number | string) {
  if (!selectedElement.value || selectedElement.value.dataset.type !== 'Grid') return
  
  let newHeight: number
  if (val !== undefined) {
    newHeight = typeof val === 'string' ? parseInt(val) : (typeof val === 'number' ? val : (val as any).value || 150)
  } else {
    newHeight = gridImageHeightRef.value
  }
  
  if (isNaN(newHeight)) newHeight = 150
  gridImageHeightRef.value = newHeight
  
  // Seteamos la variable CSS en el bloque contenedor
  selectedElement.value.style.setProperty('--grid-img-h', newHeight + 'px')
  
  // También aplicamos la altura base a las imágenes para asegurar compatibilidad inicial
  const imgs = selectedElement.value.querySelectorAll("img.grid-img, [data-toggle='image'] img, td img")
  imgs.forEach((img: any) => {
    // IMPORTANTE: No usamos !important aquí para que la media-query global de variables pueda ganar en móvil
    img.style.height = newHeight + 'px'
    img.style.objectFit = 'cover'
    img.setAttribute('height', newHeight.toString())
  })

  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function updateImageHeight(val?: number | string) {
  if (!selectedElement.value || (selectedElement.value.dataset.type !== 'Imagen' && selectedElement.value.dataset.type !== 'Tarjeta')) return
  
  let newHeight: number
  if (val !== undefined) {
    newHeight = typeof val === 'string' ? parseInt(val) : (typeof val === 'number' ? val : (val as any).value || 300)
  } else {
    newHeight = imageHeightRef.value
  }
  
  if (isNaN(newHeight)) newHeight = 300
  imageHeightRef.value = newHeight
  
  selectedElement.value.style.setProperty('--main-img-h', newHeight + 'px')
  
  const img = selectedElement.value.querySelector("[data-toggle='image'] img") as HTMLImageElement
  if (img) {
    img.classList.add('main-img-responsive')
    img.style.height = '' // Remove inline height so CSS wins
    img.style.objectFit = 'cover'
    img.setAttribute('height', newHeight.toString())
  }

  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function updateBorderWidth(val: number | string) {
  if (!selectedElement.value) return
  const newWidth = typeof val === 'string' ? parseInt(val) : val
  borderWidthRef.value = newWidth
  selectedElement.value.style.borderWidth = newWidth + 'px'
  selectedElement.value.style.borderStyle = newWidth > 0 ? 'solid' : 'none'
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function updateBorderColor() {
  if (!selectedElement.value) return
  const current = rgbToHex(selectedElement.value.style.borderColor || '#e9e9e9')
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(i18n.t('editor.border_color_title'), i18n.t('editor.border_color_label'), current, 'color', (color) => {
    if (selectedElement.value) {
      selectedElement.value.style.borderColor = color
      borderColorRef.value = color
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
    }
  }, 'primary', undefined, 'border')
}

// ─── Button Controls ─────────────────────────────────────────────────────────

function updateButtonColor() {
  if (!selectedElement.value) return
  const buttons = selectedElement.value.querySelectorAll('[data-toggle="button"]')
  if (buttons.length === 0) return
  const current = (buttons[0] as HTMLElement).style.background || '#6366f1'
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(i18n.t('editor.color_block_title'), i18n.t('editor.color_block_label'), current, 'color', (color) => {
    buttons.forEach((b) => {
      const btn = b as HTMLElement
      btn.style.background = color
      btn.dataset.customBg = 'true'
    })
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
  }, 'primary', undefined, 'block')
}

function updateThisButtonColor() {
  const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
  if (!btn) return
  const current = rgbToHex(btn.style.background || '#6366f1')
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(i18n.t('editor.color_btn_title'), i18n.t('editor.color_btn_label'), current, 'color', (color) => {
    btn.style.background = color
    btn.dataset.customBg = 'true'
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
  }, 'primary', undefined, 'button')
}

function updateButtonLink() {
  const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
  if (!btn) return
  const current = btn.getAttribute('href') || '#'
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(i18n.t('editor.btn_link_title'), i18n.t('editor.btn_link_label'), current, 'text', (url) => {
    btn.setAttribute('href', url)
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
  })
}

function updateThisButtonRadius() {
  const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
  if (!btn) return
  btn.style.borderRadius = buttonRadiusRef.value + 'px'
  btn.dataset.customRadius = 'true'
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function removeThisButton() {
  const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
  if (!btn) return
  const count = selectedElement.value?.querySelectorAll('[data-toggle="button"]')?.length || 0
  const i18n = (useNuxtApp().$i18n as any)
  if (count <= 1) {
    showToast(i18n.t('editor.btn_min_error'), 'info')
    return
  }
  openPrompt(
    i18n.t('editor.btn_delete_title'),
    i18n.t('editor.btn_delete_label'),
    '',
    'confirm',
    () => {
      btn.remove()
      selectedSubElement.value = null
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
    },
    'danger',
    i18n.t('editor.btn_delete_confirm'),
  )
}

function addButton() {
  if (!selectedElement.value || selectedElement.value.dataset.type !== 'Botón') return
  const row = selectedElement.value.querySelector('.buttons-row')
  if (!row) return
  const first = row.querySelector('[data-toggle="button"]')
  if (!first) return
  const clone = first.cloneNode(true) as HTMLElement
  const span = clone.querySelector('span')
  if (span) span.contentEditable = 'true'
  row.appendChild(clone)
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function addFaqItem() {
  if (!selectedElement.value || selectedElement.value.dataset.type !== 'FAQ') return
  const items = selectedElement.value.querySelectorAll('.faq-item')
  if (items.length === 0) return
  
  const current = (selectedSubElement.value?.closest('.faq-item') || items[items.length - 1]) as HTMLElement
  const clone = current.cloneNode(true) as HTMLElement
  
  // Inherit border color from current item
  const currentStyle = window.getComputedStyle(current)
  const bColor = currentStyle.borderTopColor && currentStyle.borderTopColor !== 'rgba(0, 0, 0, 0)' 
    ? currentStyle.borderTopColor 
    : '#f1f5f9'

  // Clean up styles for the clone to ensure proper spacing/border
  clone.style.marginTop = '20px'
  clone.style.paddingTop = '20px'
  clone.style.borderTop = `1px solid ${bColor}`
  clone.style.marginBottom = '0'
  
  // Ensure consistent spacing
  current.style.marginBottom = '20px'
  current.style.borderBottom = 'none'

  current.parentNode?.insertBefore(clone, current.nextSibling)
  
  setTimeout(() => {
    clone.click()
  }, 50)

  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

function removeFaqItem() {
  const item = selectedSubElement.value?.closest('.faq-item') as HTMLElement
  if (!item) return
  const count = selectedElement.value?.querySelectorAll('.faq-item')?.length || 0
  const i18n = (useNuxtApp().$i18n as any)
  if (count <= 1) {
    showToast(i18n.t('editor.faq_min_error') || 'At least one FAQ item is required', 'info')
    return
  }
  
  const sibling = (item.previousElementSibling?.closest('.faq-item') || item.nextElementSibling?.closest('.faq-item') || selectedElement.value?.querySelector('.faq-item')) as HTMLElement
  
  item.remove()
  selectedSubElement.value = null
  
  if (sibling) {
    setTimeout(() => {
      sibling.click()
    }, 50)
  }

  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

function addSocialIcon(targetBlock?: HTMLElement) {
  const block = targetBlock || (selectedElement.value?.dataset.type === 'Redes Sociales' ? selectedElement.value : null)
  if (!block) return
  
  // Find the icons container (usually the last div in the block)
  const divs = block.querySelectorAll(':scope > div')
  const container = divs[divs.length - 1] as HTMLElement
  if (!container) return

  const items = container.querySelectorAll('.social-item')
  const current = (selectedSubElement.value?.closest('.social-item') || items[items.length - 1]) as HTMLElement
  if (current) {
    const clone = current.cloneNode(true) as HTMLElement
    current.parentNode?.insertBefore(clone, current.nextSibling)
    setTimeout(() => {
      clone.click()
    }, 50)
  } else {
    const newIcon = document.createElement('a')
    newIcon.href = '#'
    newIcon.className = 'social-item'
    newIcon.style.display = 'inline-block'
    newIcon.style.margin = '0 8px'
    newIcon.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/1384/1384060.png" width="32" height="32" alt="Social">`
    container.appendChild(newIcon)
    setTimeout(() => {
      newIcon.click()
    }, 50)
  }
  
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

function removeSocialIcon(targetItem?: HTMLElement) {
  const item = targetItem || (selectedSubElement.value?.closest('.social-item') as HTMLElement)
  if (!item) return
  
  const block = item.closest('.editable-block') as HTMLElement
  const count = block?.querySelectorAll('.social-item')?.length || 0
  const i18n = (useNuxtApp().$i18n as any)
  if (count <= 1) {
    showToast(i18n.t('editor.social_min_error') || 'At least one social icon is required', 'info')
    return
  }
  
  const sibling = (item.previousElementSibling?.closest('.social-item') || item.nextElementSibling?.closest('.social-item') || block?.querySelector('.social-item')) as HTMLElement
  
  item.remove()
  if (selectedSubElement.value === item) selectedSubElement.value = null
  
  if (sibling) {
    setTimeout(() => {
      sibling.click()
    }, 50)
  }
  
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

function rebalancePricing(block: HTMLElement) {
  const table = block.querySelector('table')
  if (!table) return
  
  // 1. Collect all pricing items and clone them to keep them safe
  const items = Array.from(block.querySelectorAll('.pricing-item')).map(el => el.cloneNode(true) as HTMLElement)
  if (items.length === 0) return

  // 2. Clear the table
  table.innerHTML = ''
  
  // 3. Define the intelligent chunks
  const chunks: HTMLElement[][] = []
  const count = items.length
  
  if (count === 4) {
    chunks.push(items.slice(0, 2))
    chunks.push(items.slice(2, 4))
  } else if (count === 5) {
    chunks.push(items.slice(0, 3))
    chunks.push(items.slice(3, 5))
  } else {
    // Default: chunks of 3
    for (let i = 0; i < count; i += 3) {
      chunks.push(items.slice(i, i + 3))
    }
  }

  // 4. Reconstruct the table with centered rows
  chunks.forEach((chunk, rowIndex) => {
    // Add vertical spacer between rows
    if (rowIndex > 0) {
      const spacerRow = document.createElement('tr')
      spacerRow.innerHTML = `<td style="height:32px; line-height:32px; font-size:1px;">&nbsp;</td>`
      table.appendChild(spacerRow)
    }

    const row = document.createElement('tr')
    const mainTd = document.createElement('td')
    mainTd.setAttribute('align', 'center')
    
    // Create an inner table for this row to keep it centered
    const innerTable = document.createElement('table')
    innerTable.setAttribute('cellpadding', '0')
    innerTable.setAttribute('cellspacing', '0')
    innerTable.setAttribute('border', '0')
    innerTable.setAttribute('align', 'center')
    innerTable.style.margin = '0 auto'
    
    const innerRow = document.createElement('tr')
    
    // Calculate width based on chunk size
    // 3 items -> 31% each, 2 items -> 48% each, 1 item -> 100%
    let itemWidth = '31%'
    let tableWidth = '100%'
    let spacerWidth = '3.5%'

    if (chunk.length === 2) {
      itemWidth = '48%'
      tableWidth = '90%' // Slightly narrower for 2 items to prevent overlapping
      spacerWidth = '4%'
    } else if (chunk.length === 1) {
      itemWidth = '100%'
      tableWidth = '60%' // Narrower for single item centering
    }

    innerTable.setAttribute('width', tableWidth)
    
    chunk.forEach((item, itemIndex) => {
      const td = document.createElement('td')
      td.setAttribute('width', itemWidth)
      td.setAttribute('valign', 'top')
      
      // Reset item styles to ensure they fit the new container
      item.style.margin = '0'
      item.style.width = '100%'
      item.style.boxSizing = 'border-box'
      
      td.appendChild(item)
      innerRow.appendChild(td)
      
      // Add horizontal spacer
      if (itemIndex < chunk.length - 1) {
        const spacer = document.createElement('td')
        spacer.setAttribute('width', spacerWidth)
        spacer.innerHTML = '&nbsp;'
        innerRow.appendChild(spacer)
      }
    })
    
    innerTable.appendChild(innerRow)
    mainTd.appendChild(innerTable)
    row.appendChild(mainTd)
    table.appendChild(row)
  })
}

function addPricingItem() {
  if (!selectedElement.value || selectedElement.value.dataset.type !== 'Precios') return
  
  const pricingItems = selectedElement.value.querySelectorAll('.pricing-item')
  if (pricingItems.length >= 6) {
    const i18n = (useNuxtApp().$i18n as any)
    showToast(i18n.t('editor.pricing_max_error') || 'Maximum 6 plans allowed', 'info')
    return
  }

  const currentItem = (selectedSubElement.value?.closest('.pricing-item') || pricingItems[pricingItems.length - 1]) as HTMLElement
  if (!currentItem) return
  
  const clone = currentItem.cloneNode(true) as HTMLElement
  
  // Reset clone to default state so we don't duplicate the "featured" badge
  const badge = Array.from(clone.children).find(c => (c as HTMLElement).style.position === 'absolute' && ((c as HTMLElement).style.top === '-12px' || (c as HTMLElement).innerText.toUpperCase().includes('POPULAR')));
  if (badge) badge.remove();
  
  const borderColor = currentStyle.value?.config?.borderColor || '#e2e8f0';
  clone.style.border = `1px solid ${borderColor}`;

  const currentIndex = Array.from(pricingItems).indexOf(currentItem)

  // Add to a temporary place or just use the items list
  currentItem.parentNode?.insertBefore(clone, currentItem.nextSibling)
  
  rebalancePricing(selectedElement.value)
  
  const allNewItems = selectedElement.value.querySelectorAll('.pricing-item')
  const newClone = allNewItems[currentIndex + 1] as HTMLElement
  if (newClone) {
    setTimeout(() => {
      newClone.click()
    }, 50)
  }
  
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

function removePricingItem() {
  const item = (selectedSubElement.value?.closest('.pricing-item') || selectedSubElement.value?.closest('td[width="31%"]')) as HTMLElement
  if (!item) return
  
  const block = item.closest('.editable-block') as HTMLElement
  if (!block) return
  
  const allItems = block.querySelectorAll('.pricing-item')
  if (allItems.length <= 1) {
    const i18n = (useNuxtApp().$i18n as any)
    showToast(i18n.t('editor.pricing_min_error') || 'At least one pricing plan is required', 'info')
    return
  }
  
  item.remove()
  selectedSubElement.value = null
  
  rebalancePricing(block)
  
  const remaining = block.querySelector('.pricing-item') as HTMLElement
  if (remaining) {
    setTimeout(() => {
      remaining.click()
    }, 50)
  }
  
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

function togglePricingFeatured(targetItem?: HTMLElement) {
  const item = targetItem || (selectedSubElement.value?.closest('.pricing-item') as HTMLElement)
  if (!item) return
  
  const badge = Array.from(item.children).find(c => (c as HTMLElement).style.position === 'absolute' && ((c as HTMLElement).style.top === '-12px' || (c as HTMLElement).innerText.toUpperCase().includes('POPULAR')));
  
  const accentColor = currentStyle.value?.config?.accentColor || '#6366f1';
  const borderColor = currentStyle.value?.config?.borderColor || '#e2e8f0';

  if (badge) {
    // Remove it
    badge.remove();
    item.style.border = `1px solid ${borderColor}`;
  } else {
    // Add it
    const newBadge = document.createElement('div');
    newBadge.style.cssText = `position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:${accentColor}; color:#ffffff; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; white-space:nowrap;`;
    newBadge.innerText = 'Más Popular';
    item.style.position = 'relative';
    item.style.border = `2px solid ${accentColor}`;
    item.prepend(newBadge);
  }
  
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().triggerAutosave(true)
  })
}

function rebalanceMetrics(block: HTMLElement) {
  const table = block.querySelector('.metrics-table') as HTMLTableElement
  if (!table) return
  
  // Use a 6-column grid for perfect alignment (LCM of 1, 2, 3)
  table.style.tableLayout = 'fixed'
  table.setAttribute('width', '100%')

  const items = Array.from(block.querySelectorAll('.metric-item')).map(el => el.cloneNode(true) as HTMLElement)
  const count = items.length
  if (count === 0) return

  table.innerHTML = ''
  
  const rows: HTMLElement[][] = []
  
  if (count === 4) {
    rows.push([items[0], items[1]])
    rows.push([items[2], items[3]])
  } else if (count === 2) {
    rows.push([items[0], items[1]])
  } else {
    for (let i = 0; i < count; i += 3) {
      rows.push(items.slice(i, i + 3))
    }
  }

  rows.forEach((rowItems, rowIndex) => {
    const tr = document.createElement('tr')
    
    // CASE: 5 Items - Pyramid centering logic
    if (count === 5 && rowItems.length === 2) {
      // Row 2 of 5: [Spacer(1)] [Item(2)] [Item(2)] [Spacer(1)] = 6 cols
      const spacerLeft = document.createElement('td')
      spacerLeft.setAttribute('colspan', '1')
      tr.appendChild(spacerLeft)
      
      rowItems.forEach((item) => {
        const td = document.createElement('td')
        td.setAttribute('colspan', '2')
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.className = 'metric-td'
        td.appendChild(item)
        tr.appendChild(td)
      })
      
      const spacerRight = document.createElement('td')
      spacerRight.setAttribute('colspan', '1')
      tr.appendChild(spacerRight)
    } 
    // CASE: 4 Items - 2x2 grid
    else if (count === 4) {
      rowItems.forEach((item) => {
        const td = document.createElement('td')
        td.setAttribute('colspan', '3') // 3+3 = 6
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.className = 'metric-td'
        td.appendChild(item)
        tr.appendChild(td)
      })
    }
    // CASE: 2 Items - 1x2 grid
    else if (count === 2) {
      rowItems.forEach((item) => {
        const td = document.createElement('td')
        td.setAttribute('colspan', '3') // 3+3 = 6
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.className = 'metric-td'
        td.appendChild(item)
        tr.appendChild(td)
      })
    }
    // CASE: Standard (1, 3, or Row 1 of 5/6)
    else {
      const colspan = (6 / rowItems.length).toString()
      rowItems.forEach((item) => {
        const td = document.createElement('td')
        td.setAttribute('colspan', colspan)
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.className = 'metric-td'
        td.appendChild(item)
        tr.appendChild(td)
      })
    }
    table.appendChild(tr)
  })
}

function addMetricItem() {
  if (!selectedElement.value || selectedElement.value.dataset.type !== 'Métricas') return
  
  const items = selectedElement.value.querySelectorAll('.metric-item')
  if (items.length >= 6) {
    showToast((useNuxtApp().$i18n as any).t('editor.metrics_max_error') || 'Maximum 6 metrics allowed', 'info')
    return
  }

  const current = (selectedSubElement.value?.closest('.metric-item') || items[items.length - 1]) as HTMLElement
  if (!current) return

  const currentIndex = Array.from(items).indexOf(current)
  
  const clone = current.cloneNode(true) as HTMLElement
  current.closest('td')?.after(clone) // Temporary place
  
  rebalanceMetrics(selectedElement.value)
  
  const allNewItems = selectedElement.value.querySelectorAll('.metric-item')
  const newClone = allNewItems[currentIndex + 1] as HTMLElement
  if (newClone) {
    setTimeout(() => {
      newClone.click()
    }, 50)
  }
  
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

function removeMetricItem() {
  const item = selectedSubElement.value?.closest('.metric-item') as HTMLElement
  if (!item) return
  
  const block = item.closest('.editable-block') as HTMLElement
  if (!block) return
  
  const all = block.querySelectorAll('.metric-item')
  if (all.length <= 1) {
    showToast((useNuxtApp().$i18n as any).t('editor.metrics_min_error') || 'At least one metric is required', 'info')
    return
  }
  
  item.remove()
  selectedSubElement.value = null
  rebalanceMetrics(block)
  
  const remaining = block.querySelector('.metric-item') as HTMLElement
  if (remaining) {
    setTimeout(() => {
      remaining.click()
    }, 50)
  }
  
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

function updateImage() {
  if (!selectedElement.value) return
  
  // Prefer the image in the selected sub-element, fallback to first image in block
  const subImg = (selectedSubElement.value?.tagName === 'IMG' 
    ? selectedSubElement.value 
    : selectedSubElement.value?.querySelector('img')) as HTMLImageElement
    
  const img = subImg || selectedElement.value.querySelector('img')
  if (!img) return
  
  openImageModal(img as HTMLImageElement)
}

// ─── AI Improvement ──────────────────────────────────────────────────────────

async function improveBlockWithAI(el?: HTMLElement) {
  const target = el || selectedElement.value
  if (!target) return

  const textToImprove = target.innerHTML

  const i18n = (useNuxtApp().$i18n as any)
  if (!textToImprove || target.innerText.trim().length < 5) {
    showToast(i18n.t('editor.ai_no_text'), 'info')
    return
  }

  isImprovingAI.value = true
  showToast(i18n.t('editor.ai_improving'), 'info')
  
  // Añadir efecto visual al bloque
  target.classList.add('ai-improving')

  try {
    const { improvedText } = await $fetch<{ improvedText: string }>('/api/ai/improve', {
      method: 'POST',
      body: { text: textToImprove }
    })

    if (improvedText) {
      // Aplicamos el HTML mejorado manteniendo la estructura
      target.innerHTML = improvedText
      showToast(i18n.t('editor.ai_success'), 'success')
      
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
        useIframeEngine().refreshLayers()
        useIframeEngine().triggerAutosave(true)
      })
    }
  } catch (err: any) {
    showToast(err.statusMessage || i18n.t('editor.ai_error'), 'error')
  } finally {
    isImprovingAI.value = false
    target.classList.remove('ai-improving')
  }
}

async function improveAllWithAI() {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return

  const blocks = doc.querySelectorAll('.editable-block')
  if (blocks.length === 0) return

  const i18n = (useNuxtApp().$i18n as any)
  showToast(i18n.t('editor.ai_improving_all'), 'info')
  isImprovingAI.value = true

  try {
    for (const block of Array.from(blocks)) {
      const el = block as HTMLElement
      const html = el.innerHTML
      if (el.innerText.trim().length < 10 || el.dataset.type === 'Imagen' || el.dataset.type === 'Botón') continue

      // Efecto visual individual
      el.classList.add('ai-improving')

      try {
        const { improvedText } = await $fetch<{ improvedText: string }>('/api/ai/improve', {
          method: 'POST',
          body: { text: html }
        })

        if (improvedText) {
          el.innerHTML = improvedText
        }
      } catch (e) {
        console.error('Error mejorando bloque individual', e)
      } finally {
        el.classList.remove('ai-improving')
      }
    }
    showToast(i18n.t('editor.ai_success_all'), 'success')
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
      useIframeEngine().refreshLayers()
      useIframeEngine().triggerAutosave(true)
    })
  } catch (err: any) {
    showToast(i18n.t('editor.ai_error_all'), 'error')
  } finally {
    isImprovingAI.value = false
  }
}

// ─── Image Modal ─────────────────────────────────────────────────────────────

function openImageModal(el: HTMLImageElement) {
  imageModal.targetEl = el
  imageModal.src = el.src
  const link = el.closest('a')
  if (link) {
    imageModal.linkEl = link
    imageModal.link = link.getAttribute('href') || ''
    imageModal.target = link.getAttribute('target') || '_blank'
  } else {
    imageModal.linkEl = null
    imageModal.link = ''
    imageModal.target = '_blank'
  }
  imageModal.visible = true
}

function applyImageSettings() {
  if (!imageModal.targetEl) return

  if (!imageModal.src || imageModal.src.trim() === '') {
    imageModal.src = 'https://placehold.co/600x400/f8fafc/6366f1?text=Añadir+Imagen'
  }

  imageModal.targetEl.src = imageModal.src

  if (imageModal.link) {
    if (imageModal.linkEl) {
      imageModal.linkEl.setAttribute('href', imageModal.link)
      imageModal.linkEl.setAttribute('target', imageModal.target)
    } else {
      const link = imageModal.targetEl.ownerDocument.createElement('a')
      link.setAttribute('href', imageModal.link)
      link.setAttribute('target', imageModal.target)
      link.style.textDecoration = 'none'
      imageModal.targetEl.parentNode?.replaceChild(link, imageModal.targetEl)
      link.appendChild(imageModal.targetEl)
    }
  } else if (imageModal.linkEl) {
    imageModal.linkEl.parentNode?.replaceChild(imageModal.targetEl, imageModal.linkEl)
  }

  imageModal.visible = false
  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
}

// ─── Drag Handlers ───────────────────────────────────────────────────────────

function handleSidebarDragStart(content: string, event: DragEvent) {
  deselect()
  editorDragState.draggedModule = content
  isSidebarDragging.value = true
  if (event.target) (event.target as HTMLElement).classList.add('dragging-source')
}

function handleSidebarDragEnd(event: DragEvent) {
  isSidebarDragging.value = false
  if (event.target) (event.target as HTMLElement).classList.remove('dragging-source')
}

function handleLayerDragStart(el: HTMLElement, event: DragEvent) {
  deselect()
  editorDragState.draggedLayer = el
  isLayerDragging.value = true
  const target = (event.target as HTMLElement).closest('.stack-item')
  if (target) target.classList.add('dragging-layer')
}

function handleLayerDragEnd(event: DragEvent) {
  isLayerDragging.value = false
  if (event.target) (event.target as HTMLElement).classList.remove('dragging-layer')
}

function handleLayerDrop(index: number, e: DragEvent) {
  if (!editorDragState.draggedLayer) return
  const targetEl = layerList.value[index].el
  if (editorDragState.draggedLayer === targetEl) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const isTop = e.clientY - rect.top < rect.height / 2

  if (isTop) targetEl.parentNode?.insertBefore(editorDragState.draggedLayer, targetEl)
  else targetEl.after(editorDragState.draggedLayer)

  import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
    useIframeEngine().refreshLayers()
    useIframeEngine().triggerAutosave(true)
  })
}

export function useBlockEditor() {
  return {
    selectElement,
    deselect,
    switchToEditPanel,
    deleteSelectedBlock,
    moveLayer,
    toggleVisibility,
    isVisible,
    toggleCardLayout,
    getCardLayout,
    toggleButtonLayout,
    getButtonLayout,
    previewBlockColor,
    previewTextColor,
    previewBorderColor,
    updateBgColor,
    updateTextColor,
    updateFont,
    previewFont,
    cancelFontSelection,
    applyFont,
    updateTextAlign,
    getTextAlign,
    updateFontSize,
    updateLogoWidth,
    updateGridImageHeight,
    updateImageHeight,
    updateBorderWidth,
    updateBorderColor,
    updateButtonColor,
    updateThisButtonColor,
    updateButtonLink,
    updateThisButtonRadius,
    removeThisButton,
    addButton,
    addFaqItem,
    removeFaqItem,
    addSocialIcon,
    removeSocialIcon,
    addPricingItem,
    removePricingItem,
    togglePricingFeatured,
    addMetricItem,
    removeMetricItem,
    updateImage,
    openImageModal,
    applyImageSettings,
    handleSidebarDragStart,
    handleSidebarDragEnd,
    handleLayerDragStart,
    handleLayerDragEnd,
    handleLayerDrop,
    improveBlockWithAI,
    improveAllWithAI,
    isImprovingAI,
  }
}
