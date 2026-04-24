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
  visibilityTrigger,
  layoutTrigger,
  originalFontBeforePreview,
  originalColorBeforePreview,
  editorDragState,
  isSidebarDragging,
  isLayerDragging,
  layerList,
  imageModal,
} = useEditorState()

const { openPrompt } = usePrompt()
const { showToast } = useToast()

const isImprovingAI = ref(false)

// ─── Selection ───────────────────────────────────────────────────────────────

function selectElement(el: HTMLElement, subEl?: HTMLElement) {
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

  activePanel.value = 'edit'
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

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
  }
}

function previewTextColor(color: string) {
  if (!selectedElement.value || !color) return
  const isCompleteHex = /^#([0-9A-F]{3}){1,2}$/i.test(color)
  const isInherit = color.toLowerCase() === 'inherit' || color.toLowerCase() === 'transparent'
  if (isCompleteHex || isInherit) {
    const finalColor = isInherit ? 'inherit' : color
    selectedElement.value.style.color = finalColor
    selectedElement.value.querySelectorAll('div, p, span, td, h1, h2, h3, b, strong, a').forEach((el: any) => {
      el.style.color = finalColor
    })
  }
}

function updateBgColor() {
  if (!selectedElement.value) return
  const current = rgbToHex(selectedElement.value.style.backgroundColor || 'transparent')
  originalColorBeforePreview.value = current
  openPrompt('Color de Fondo', 'Elige un tono institucional:', current, 'color', (val) => {
    if (val) {
      previewBlockColor(val)
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave())
    } else {
      previewBlockColor(originalColorBeforePreview.value)
    }
  })
}

function updateTextColor() {
  if (!selectedElement.value) return
  const current = rgbToHex(selectedElement.value.style.color || 'inherit')
  originalColorBeforePreview.value = current
  openPrompt('Color del Texto', 'Define el color de la tipografía:', current, 'color', (val) => {
    if (val) {
      previewTextColor(val)
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave())
    } else {
      previewTextColor(originalColorBeforePreview.value)
    }
  })
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

// ─── Button Controls ─────────────────────────────────────────────────────────

function updateButtonColor() {
  if (!selectedElement.value) return
  const buttons = selectedElement.value.querySelectorAll('[data-toggle="button"]')
  if (buttons.length === 0) return
  const current = (buttons[0] as HTMLElement).style.background || '#6366f1'
  openPrompt('Color del Bloque', 'Color para todos los botones del bloque:', current, 'color', (color) => {
    buttons.forEach((b) => ((b as HTMLElement).style.background = color))
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
  })
}

function updateThisButtonColor() {
  const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
  if (!btn) return
  const current = rgbToHex(btn.style.background || '#6366f1')
  openPrompt('Color de Botón', 'Elige el color para este botón específico:', current, 'color', (color) => {
    btn.style.background = color
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
  })
}

function updateButtonLink() {
  const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
  if (!btn) return
  const current = btn.getAttribute('href') || '#'
  openPrompt('Enlace del Botón', 'URL o enlace para este botón:', current, 'text', (url) => {
    btn.setAttribute('href', url)
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
  })
}

function removeThisButton() {
  const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
  if (!btn) return
  const count = selectedElement.value?.querySelectorAll('[data-toggle="button"]')?.length || 0
  if (count <= 1) {
    showToast('El módulo debe tener al menos un botón', 'info')
    return
  }
  openPrompt(
    'Eliminar Botón',
    '¿Estás seguro de que quieres eliminar este botón?',
    '',
    'confirm',
    () => {
      btn.remove()
      selectedSubElement.value = null
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => useIframeEngine().triggerAutosave(true))
    },
    'danger',
    'Confirmar Eliminación',
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

function updateImage() {
  if (!selectedElement.value) return
  const img = selectedElement.value.querySelector('img')
  if (!img) return
  openPrompt('Editar Imagen', 'URL del recurso visual:', img.src, 'text', (val) => {
    if (val) img.src = val
  })
}

// ─── AI Improvement ──────────────────────────────────────────────────────────

async function improveBlockWithAI(el?: HTMLElement) {
  const target = el || selectedElement.value
  if (!target) return

  const textToImprove = target.innerHTML

  if (!textToImprove || target.innerText.trim().length < 5) {
    showToast('No hay suficiente texto para mejorar', 'info')
    return
  }

  isImprovingAI.value = true
  showToast('Optimizando textos con IA...', 'info')
  
  // Añadir efecto visual al bloque
  target.classList.add('ai-improving')

  try {
    const { improvedText } = await $fetch('/api/ai/improve', {
      method: 'POST',
      body: { text: textToImprove }
    })

    if (improvedText) {
      // Aplicamos el HTML mejorado manteniendo la estructura
      target.innerHTML = improvedText
      showToast('Texto optimizado con éxito', 'success')
      
      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
        useIframeEngine().refreshLayers()
        useIframeEngine().triggerAutosave(true)
      })
    }
  } catch (err: any) {
    showToast(err.statusMessage || 'Error al conectar con OpenAI', 'error')
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

  showToast('Mejorando toda la plantilla...', 'info')
  isImprovingAI.value = true

  try {
    for (const block of Array.from(blocks)) {
      const el = block as HTMLElement
      const html = el.innerHTML
      if (el.innerText.trim().length < 10 || el.dataset.type === 'Imagen' || el.dataset.type === 'Botón') continue

      // Efecto visual individual
      el.classList.add('ai-improving')

      try {
        const { improvedText } = await $fetch('/api/ai/improve', {
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
    showToast('Plantilla mejorada al completo', 'success')
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
      useIframeEngine().refreshLayers()
      useIframeEngine().triggerAutosave(true)
    })
  } catch (err: any) {
    showToast('Error durante la mejora global', 'error')
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
  editorDragState.draggedModule = content
  isSidebarDragging.value = true
  if (event.target) (event.target as HTMLElement).classList.add('dragging-source')
}

function handleSidebarDragEnd(event: DragEvent) {
  isSidebarDragging.value = false
  if (event.target) (event.target as HTMLElement).classList.remove('dragging-source')
}

function handleLayerDragStart(el: HTMLElement, event: DragEvent) {
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
    updateButtonColor,
    updateThisButtonColor,
    updateButtonLink,
    removeThisButton,
    addButton,
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
