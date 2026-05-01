import { watch } from 'vue'
import { useEditorState } from '~/composables/useEditorState'
import { useToast } from '~/composables/useToast'
import { iframeEditorStyles } from '~/utils/iframeStyles'
import { editorStyleBases, type EditorStyleBase } from '~/utils/editorStyles'

declare global {
  interface Window {
    draggedElement: HTMLElement | null
  }
}

const {
  iframeRef,
  htmlContent,
  selectedElement,
  selectedSubElement,
  layerList,
  undoStack,
  redoStack,
  maxHistory,
  editorDragState,
  activePanel,
  isMorphing,
  promptData,
  viewMode,
  refreshLayersTrigger,
  isDraggingOverIframe,
} = useEditorState()

const { showToast } = useToast()

// Debounce handles
let iframeEventsController: AbortController | null = null
let historyDebounce: ReturnType<typeof setTimeout> | null = null
let autosaveTimeout: ReturnType<typeof setTimeout> | null = null

// ─── Undo / Redo ─────────────────────────────────────────────────────────────

function pushToHistory() {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  const toolbar = doc.getElementById('floating-toolbar')
  if (toolbar) toolbar.remove()
  const snapshot = doc.body.innerHTML
  if (toolbar) doc.body.appendChild(toolbar)
  if (undoStack.value.length > 0 && undoStack.value[undoStack.value.length - 1] === snapshot) return
  undoStack.value.push(snapshot)
  if (undoStack.value.length > maxHistory) undoStack.value.shift()
  redoStack.value = []
}

function restoreSnapshot(html: string) {
  const doc = iframeRef.value?.contentDocument
  if (!doc || !html) return
  doc.body.innerHTML = html
  doc.querySelectorAll('.editable-block').forEach((el: any) => initBlock(el, doc))
  injectFloatingToolbar(doc)
  setupIframeEvents(doc)
  refreshLayers()
}

function undo() {
  if (undoStack.value.length <= 1) return
  const current = undoStack.value.pop()
  if (current) redoStack.value.push(current)
  restoreSnapshot(undoStack.value[undoStack.value.length - 1])
}

function redo() {
  if (redoStack.value.length === 0) return
  const snapshot = redoStack.value.pop()
  if (snapshot) {
    undoStack.value.push(snapshot)
    restoreSnapshot(snapshot)
  }
}

// ─── Layers ──────────────────────────────────────────────────────────────────

function refreshLayers() {
  refreshLayersTrigger.value++
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  const blocks = doc.querySelectorAll('.editable-block')
  layerList.value = Array.from(blocks).map((el: any) => ({
    id: el.dataset.id || 'layer-' + Math.random(),
    type: el.dataset.type || 'Bloque',
    text: (el.innerText || '').substring(0, 30) + ((el.innerText || '').length > 30 ? '...' : ''),
    el,
  }))
}

// ─── Block Initialisation ────────────────────────────────────────────────────

function initBlock(el: HTMLElement, doc: Document) {
  el.classList.add('editable-block')
  if (!el.dataset.id) el.dataset.id = 'blk-' + Math.random().toString(36).substring(2, 9)
  if (!el.dataset.type) {
    if (el.classList.contains('header-block')) el.dataset.type = 'Header'
    else if (el.classList.contains('body-block')) el.dataset.type = 'Contenido'
    else if (el.classList.contains('signature-block')) el.dataset.type = 'Firma'
    else if (el.classList.contains('cta-block')) el.dataset.type = 'Botón'
    else if (el.classList.contains('methodology-block')) el.dataset.type = 'Nota'
    else if (el.classList.contains('grid-block')) el.dataset.type = 'Grid'
    else if (el.classList.contains('hero-block')) el.dataset.type = 'Hero'
    else if (el.classList.contains('testimonials-block')) el.dataset.type = 'Testimonios'
    else if (el.classList.contains('pricing-block')) el.dataset.type = 'Precios'
    else if (el.classList.contains('video-block')) el.dataset.type = 'Video'
    else if (el.classList.contains('social-block')) el.dataset.type = 'Redes Sociales'
    else if (el.classList.contains('divider-block')) el.dataset.type = 'Separador'
    else if (el.classList.contains('faq-block')) el.dataset.type = 'FAQ'
    else if (el.classList.contains('presence-block')) el.dataset.type = 'Presencia'
    else if (el.classList.contains('unsubscribe-block')) el.dataset.type = 'Unsuscribir'
    else if (el.classList.contains('metrics-block')) el.dataset.type = 'Métricas'
    else el.dataset.type = 'Bloque'
  }

  if (el.dataset.type === 'Botón') {
    el.querySelectorAll('a').forEach((a) => {
      if (!a.dataset.toggle) (a as HTMLElement).dataset.toggle = 'button'
    })
  }

  if (!el.querySelector('.visor-drag-handle')) {
    const handle = doc.createElement('div')
    handle.className = 'visor-drag-handle'
    handle.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
      </svg>
    `
    handle.draggable = true
    handle.dataset.ignoreSave = 'true'
    handle.addEventListener('dragstart', (e) => {
      e.stopPropagation()
      ;(window as any).draggedElement = el
      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().handleLayerDragStart(el, e as DragEvent)
      })
    })
    handle.addEventListener('dragend', (e: any) => {
      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().handleLayerDragEnd(e)
      })
    })
    el.prepend(handle)

    el.prepend(handle)
  }

  el.setAttribute('draggable', 'true')
  // Enable inline editing for common text elements with a smarter non-nesting logic
  const textTags = 'div, span, p, h1, h2, h3, b, td, a, i, u, strong, em, font, s, small, sub, sup'
  el.querySelectorAll(textTags).forEach((child: any) => {
    if (child.dataset.toggle === 'button') {
      child.contentEditable = 'false'
      return
    }

    // Si ya está dentro de algo editable, no necesitamos marcarlo (hereda)
    // Esto evita el problema del triple click que borra la estructura
    if (child.parentElement && child.parentElement.isContentEditable) {
      return
    }

    const hasDirectText = Array.from<ChildNode>(child.childNodes as NodeListOf<ChildNode>).some(
      (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0,
    )
    const hasElements = child.children.length > 0
    
    // Check if it's a known text toggle (title, subtitle, etc.)
    const isTextToggle = ['title', 'subtitle', 'badge', 'ps', 'contact'].includes(child.dataset.toggle || '')

    // Si es una hoja con texto, un contenedor con texto directo (mezcla), o un toggle de texto conocido
    if (!hasElements || hasDirectText || isTextToggle) {
      child.contentEditable = 'true'
      child.spellcheck = false
      child.setAttribute('draggable', 'false')
    }
  })

  el.addEventListener('dragstart', () => {
    window.draggedElement = el
    el.classList.add('dragging')
  })
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging')
    doc.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((n) =>
      n.classList.remove('drag-over-top', 'drag-over-bottom'),
    )
  })
}

// ─── Floating Toolbar ────────────────────────────────────────────────────────

function injectFloatingToolbar(doc: Document) {
  const existing = doc.getElementById('floating-toolbar')
  if (existing) existing.remove()

  const toolbar = doc.createElement('div')
  toolbar.id = 'floating-toolbar'
  toolbar.innerHTML = `
    <button data-cmd="bold" title="Negrita"><b>B</b></button>
    <button data-cmd="italic" title="Cursiva"><i>I</i></button>
    <button data-cmd="underline" title="Subrayado"><u>U</u></button>
    <button data-cmd="foreColor" title="Color de Texto"><span>A</span><div style="height:2px;background:currentColor;width:10px;margin-top:-2px;"></div></button>
    <div style="width:1px;height:18px;background:rgba(255,255,255,0.1);margin:auto 4px;"></div>
    <button data-cmd="fontSizeDec" title="Disminuir Tamaño" style="font-size: 11px;">A-</button>
    <button data-cmd="fontSizeInc" title="Aumentar Tamaño" style="font-size: 15px;">A+</button>
    <div style="width:1px;height:18px;background:rgba(255,255,255,0.1);margin:auto 4px;"></div>
    <button data-cmd="createLink" title="Insertar Link">🔗</button>
  `
  doc.body.appendChild(toolbar)

  toolbar.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const cmd = btn.dataset.cmd
      if (cmd === 'createLink') {
        if (window.parent && (window.parent as any).openLinkPrompt) {
          ;(window.parent as any).openLinkPrompt((url: string) => {
            if (url) {
              doc.body.focus()
              doc.execCommand('createLink', false, url)
              triggerAutosave(true)
            }
          })
        }
      } else if (cmd === 'foreColor') {
        if (window.parent && (window.parent as any).openColorPrompt) {
          ;(window.parent as any).openColorPrompt((color: string) => {
            if (color) {
              const win = doc.defaultView
              if (!win) return
              win.focus()
              doc.body.focus()
              
              const selection = win.getSelection()
              if (selection && !selection.isCollapsed) {
                // Use span instead of the old <font> tag
                doc.execCommand('styleWithCSS', false, 'true')
                doc.execCommand('foreColor', false, color)
              } else if (selectedElement.value) {
                // If no selection but a block is selected (rare in toolbar but good fallback)
                selectedElement.value.style.color = color
                selectedElement.value.querySelectorAll('div, p, span, td, h1, h2, h3, b, strong, a').forEach((el: any) => {
                  el.style.color = color
                })
              }
              triggerAutosave(true)
            }
          })
        }
      } else if (cmd === 'fontSizeInc' || cmd === 'fontSizeDec') {
        const win = doc.defaultView
        if (!win) return
        const selection = win.getSelection()
        if (!selection || selection.rangeCount === 0) return

        const delta = cmd === 'fontSizeInc' ? 2 : -2
        let container = selection.anchorNode as any
        if (container.nodeType === 3) container = container.parentElement
        
        // Find nearest element with font-size
        const computedStyle = win.getComputedStyle(container)
        const currentSize = parseInt(computedStyle.fontSize) || 16
        const newSize = Math.max(8, Math.min(72, currentSize + delta))
        
        // Apply to the element directly if it's a small text container
        // or wrap the selection if it's part of a larger text
        if (selection.toString().trim() === container.innerText.trim()) {
          container.style.fontSize = newSize + 'px'
          container.style.lineHeight = Math.round(newSize * 1.5) + 'px'
        } else {
          doc.execCommand('fontSize', false, '7') // Temporary marker
          const fonts = doc.querySelectorAll('font[size="7"]')
          fonts.forEach(f => {
            const span = doc.createElement('span')
            span.style.fontSize = newSize + 'px'
            span.style.lineHeight = Math.round(newSize * 1.5) + 'px'
            span.innerHTML = f.innerHTML
            f.parentNode?.replaceChild(span, f)
          })
        }
        triggerAutosave(true)
      } else {
        const win = doc.defaultView
        if (win) win.focus()
        doc.body.focus()
        doc.execCommand(cmd!, false)
        triggerAutosave(true)
      }
    })
  })
}

function ensureMainCard(doc: Document) {
  let mainCard = doc.querySelector('.main-card') as HTMLElement
  if (!mainCard) {
    mainCard = doc.createElement('div')
    mainCard.className = 'main-card'
    doc.body.appendChild(mainCard)
    // Apply current global style to the new container
    import('~/composables/useEditorState').then(({ useEditorState }) => {
       applyStyleBase(useEditorState().currentStyle.value, true)
    })
  }
  return mainCard
}

// ─── Iframe Events ───────────────────────────────────────────────────────────

function setupIframeEvents(doc: Document) {
  if (iframeEventsController) iframeEventsController.abort()
  iframeEventsController = new AbortController()
  const { signal } = iframeEventsController

  // ─── Keyboard Shortcuts ───────────────────────────────────────────────────
  doc.addEventListener('keydown', (e: any) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      import('~/composables/useTemplateManager').then(({ useTemplateManager }) => {
        useTemplateManager().handleSave()
      })
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault()
      redo()
    }
    if (e.key === 'Delete') {
      const isEditing = (e.target as HTMLElement)?.isContentEditable
      if (!isEditing && selectedElement.value) {
        e.preventDefault()
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          useBlockEditor().deleteSelectedBlock()
        })
      }
    }
  }, { signal })

  // ─── Natural Editing: Pricing Features ─────────────────────────────────────
  doc.addEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    
    if (e.key === 'Enter' && target.classList.contains('pricing-feature')) {
      e.preventDefault()
      e.stopImmediatePropagation()
      target.style.marginBottom = '8px'
      const clone = target.cloneNode(true) as HTMLElement
      clone.innerText = '✓ ' 
      clone.style.marginBottom = '8px'
      clone.style.display = 'block'
      target.parentNode?.insertBefore(clone, target.nextSibling)
      
      setTimeout(() => {
        clone.focus()
        const range = doc.createRange()
        const sel = doc.getSelection()
        if (clone.firstChild) {
          range.setStart(clone.firstChild, clone.innerText.length)
          range.collapse(true)
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      }, 0)
      triggerAutosave(true)
      return
    }

    if (e.key === 'Backspace' && target.classList.contains('pricing-feature')) {
      const text = target.innerText.replace('✓', '').trim()
      if (text === '') {
        e.preventDefault()
        const prev = target.previousElementSibling as HTMLElement
        if (prev) {
          prev.focus()
          const range = doc.createRange()
          const sel = doc.getSelection()
          range.selectNodeContents(prev)
          range.collapse(false)
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
        target.remove()
        triggerAutosave(true)
      }
    }
  }, { signal })

  // ─── Click-to-Add: Pricing Features ────────────────────────────────────────
  doc.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('pricing-features') && e.target === e.currentTarget) {
      const features = target.querySelectorAll('.pricing-feature')
      const last = features[features.length - 1]
      let clone: HTMLElement
      if (last) {
        clone = last.cloneNode(true) as HTMLElement
      } else {
        clone = doc.createElement('div')
        clone.className = 'pricing-feature'
        clone.dataset.toggle = 'pricing-feature'
        clone.style.fontFamily = 'Arial'
        clone.style.fontSize = '13px'
        clone.style.color = '#475569'
        clone.style.marginBottom = '8px'
        clone.contentEditable = 'true'
      }
      clone.innerText = '✓ '
      target.appendChild(clone)
      setTimeout(() => clone.focus(), 0)
      triggerAutosave(true)
    }
  }, { signal })

  // ─── Social Inline Toolbar Logic ───────────────────────────────────────────
  const injectSocialToolbar = () => {
    let toolbar = doc.getElementById('social-inline-toolbar')
    if (toolbar) return toolbar
    toolbar = doc.createElement('div')
    toolbar.id = 'social-inline-toolbar'
    toolbar.dataset.ignoreSave = 'true'
    toolbar.style.cssText = 'position:absolute;display:none;background:#0f172a;border-radius:8px;padding:4px;gap:4px;z-index:2147483647;box-shadow:0 10px 15px-3px rgb(0 0 0/0.1);border:1px solid #334155;flex-direction:row;align-items:center;'
    toolbar.innerHTML = `
      <button type="button" data-action="edit" title="Editar" style="background:none;border:none;color:white;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button type="button" data-action="add" title="Añadir" style="background:none;border:none;color:white;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
      <button type="button" data-action="remove" title="Eliminar" style="background:none;border:none;color:#f87171;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
    toolbar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseover', () => (btn.style.background = '#1e293b'))
      btn.addEventListener('mouseout', () => (btn.style.background = 'none'))
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const action = btn.dataset.action
        const targetIcon = (window as any).activeSocialItem
        if (!targetIcon) return
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          const editor = useBlockEditor()
          if (action === 'edit') {
            editor.openImageModal(targetIcon.querySelector('img') || targetIcon as any)
          } else if (action === 'add') {
            const block = targetIcon.closest('.editable-block') as HTMLElement
            editor.addSocialIcon(block)
          } else if (action === 'remove') {
            editor.removeSocialIcon(targetIcon)
            toolbar!.style.display = 'none'
          }
        })
      })
    })
    doc.body.appendChild(toolbar)
    return toolbar
  }
  // ─── Metric Inline Toolbar Logic ───────────────────────────────────────────
  const injectMetricToolbar = () => {
    let toolbar = doc.getElementById('metric-inline-toolbar')
    if (toolbar) return toolbar
    toolbar = doc.createElement('div')
    toolbar.id = 'metric-inline-toolbar'
    toolbar.dataset.ignoreSave = 'true'
    toolbar.style.cssText = 'position:absolute;display:none;background:#0f172a;border-radius:8px;padding:4px;gap:4px;z-index:2147483647;box-shadow:0 10px 15px-3px rgb(0 0 0/0.1);border:1px solid #334155;flex-direction:row;align-items:center;'
    toolbar.innerHTML = `
      <button type="button" data-action="add" title="Añadir" style="background:none;border:none;color:white;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
      <button type="button" data-action="remove" title="Eliminar" style="background:none;border:none;color:#f87171;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
    toolbar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseover', () => (btn.style.background = '#1e293b'))
      btn.addEventListener('mouseout', () => (btn.style.background = 'none'))
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const action = btn.dataset.action
        const targetItem = (window as any).activeMetricItem
        if (!targetItem) return
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          const editor = useBlockEditor()
          if (action === 'add') {
            const block = targetItem.closest('.editable-block') as HTMLElement
            editor.addMetricItem(block)
          } else if (action === 'remove') {
            editor.removeMetricItem(targetItem)
            toolbar!.style.display = 'none'
          }
        })
      })
    })
    doc.body.appendChild(toolbar)
    return toolbar
  }

  // ─── Pricing Inline Toolbar Logic ──────────────────────────────────────────
  const injectPricingToolbar = () => {
    let toolbar = doc.getElementById('pricing-inline-toolbar')
    if (toolbar) return toolbar
    toolbar = doc.createElement('div')
    toolbar.id = 'pricing-inline-toolbar'
    toolbar.dataset.ignoreSave = 'true'
    toolbar.style.cssText = 'position:absolute;display:none;background:#0f172a;border-radius:8px;padding:4px;gap:4px;z-index:2147483647;box-shadow:0 10px 15px-3px rgb(0 0 0/0.1);border:1px solid #334155;flex-direction:row;align-items:center;'
    toolbar.innerHTML = `
      <button type="button" data-action="toggle-featured" title="Destacar" style="background:none;border:none;color:#fbbf24;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></button>
      <button type="button" data-action="add" title="Añadir" style="background:none;border:none;color:white;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
      <button type="button" data-action="remove" title="Eliminar" style="background:none;border:none;color:#f87171;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
    toolbar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseover', () => (btn.style.background = '#1e293b'))
      btn.addEventListener('mouseout', () => (btn.style.background = 'none'))
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const action = btn.dataset.action
        const targetItem = (window as any).activePricingItem
        if (!targetItem) return
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          const editor = useBlockEditor()
          if (action === 'toggle-featured') {
            editor.togglePricingFeatured(targetItem)
          } else if (action === 'add') {
            const block = targetItem.closest('.editable-block') as HTMLElement
            editor.addPricingItem(block)
          } else if (action === 'remove') {
            editor.removePricingItem(targetItem)
            toolbar!.style.display = 'none'
          }
        })
      })
    })
    doc.body.appendChild(toolbar)
    return toolbar
  }

  // ─── FAQ Inline Toolbar Logic ──────────────────────────────────────────────
  const injectFaqToolbar = () => {
    let toolbar = doc.getElementById('faq-inline-toolbar')
    if (toolbar) return toolbar
    toolbar = doc.createElement('div')
    toolbar.id = 'faq-inline-toolbar'
    toolbar.dataset.ignoreSave = 'true'
    toolbar.style.cssText = 'position:absolute;display:none;background:#0f172a;border-radius:8px;padding:4px;gap:4px;z-index:2147483647;box-shadow:0 10px 15px-3px rgb(0 0 0/0.1);border:1px solid #334155;flex-direction:row;align-items:center;'
    toolbar.innerHTML = `
      <button type="button" data-action="add" title="Añadir" style="background:none;border:none;color:white;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
      <button type="button" data-action="remove" title="Eliminar" style="background:none;border:none;color:#f87171;cursor:pointer;padding:6px;display:flex;border-radius:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`
    toolbar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('mouseover', () => (btn.style.background = '#1e293b'))
      btn.addEventListener('mouseout', () => (btn.style.background = 'none'))
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const action = btn.dataset.action
        const targetItem = (window as any).activeFaqItem
        if (!targetItem) return
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          const editor = useBlockEditor()
          if (action === 'add') {
            editor.addFaqItem()
          } else if (action === 'remove') {
            editor.removeFaqItem()
            toolbar!.style.display = 'none'
          }
        })
      })
    })
    doc.body.appendChild(toolbar)
    return toolbar
  }

  // ─── Main Click Handler ────────────────────────────────────────────────────
  doc.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const socialItem = target.closest('.social-item') as HTMLElement
    const metricItem = target.closest('.metric-item') as HTMLElement
    const pricingItem = target.closest('.pricing-item') as HTMLElement
    const faqItem = target.closest('.faq-item') as HTMLElement
    
    if (socialItem) {
      e.preventDefault()
      e.stopPropagation()
      ;(window as any).activeSocialItem = socialItem
      
      const socialToolbar = injectSocialToolbar()
      socialToolbar.style.display = 'flex'
      const rect = socialItem.getBoundingClientRect()
      const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop
      let top = rect.top + scrollTop - 45
      if (top < 5) top = rect.bottom + scrollTop + 5
      socialToolbar.style.top = top + 'px'
      socialToolbar.style.left = Math.max(5, rect.left + (rect.width / 2) - 45) + 'px'
      
      const block = socialItem.closest('.editable-block') as HTMLElement
      if (selectedElement.value) selectedElement.value.classList.remove('selected')
      selectedElement.value = block
      selectedSubElement.value = socialItem
      block.classList.add('selected')
      activePanel.value = 'edit'

      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().selectElement(block, socialItem, true)
      })
      return
    } else if (metricItem) {
      e.preventDefault()
      e.stopPropagation()
      ;(window as any).activeMetricItem = metricItem
      
      const metricToolbar = injectMetricToolbar()
      metricToolbar.style.display = 'flex'
      const rect = metricItem.getBoundingClientRect()
      const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop
      let top = rect.top + scrollTop - 45
      if (top < 5) top = rect.bottom + scrollTop + 5
      metricToolbar.style.top = top + 'px'
      metricToolbar.style.left = Math.max(5, rect.left + (rect.width / 2) - 45) + 'px'
      
      const block = metricItem.closest('.editable-block') as HTMLElement
      if (selectedElement.value) selectedElement.value.classList.remove('selected')
      selectedElement.value = block
      selectedSubElement.value = metricItem
      block.classList.add('selected')
      activePanel.value = 'edit'

      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().selectElement(block, metricItem, true)
      })
      return
    } else if (pricingItem) {
      e.preventDefault()
      e.stopPropagation()
      ;(window as any).activePricingItem = pricingItem
      
      const pricingToolbar = injectPricingToolbar()
      pricingToolbar.style.display = 'flex'
      const rect = pricingItem.getBoundingClientRect()
      const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop
      let top = rect.top + scrollTop - 45
      if (top < 5) top = rect.bottom + scrollTop + 5
      pricingToolbar.style.top = top + 'px'
      pricingToolbar.style.left = Math.max(5, rect.left + (rect.width / 2) - 45) + 'px'
      
      const block = pricingItem.closest('.editable-block') as HTMLElement
      if (selectedElement.value) selectedElement.value.classList.remove('selected')
      selectedElement.value = block
      selectedSubElement.value = pricingItem
      block.classList.add('selected')
      activePanel.value = 'edit'

      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().selectElement(block, pricingItem, true)
      })
      return
    } else if (faqItem) {
      e.preventDefault()
      e.stopPropagation()
      ;(window as any).activeFaqItem = faqItem
      
      const faqToolbar = injectFaqToolbar()
      faqToolbar.style.display = 'flex'
      const rect = faqItem.getBoundingClientRect()
      const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop
      let top = rect.top + scrollTop - 45
      if (top < 5) top = rect.bottom + scrollTop + 5
      faqToolbar.style.top = top + 'px'
      faqToolbar.style.left = Math.max(5, rect.left + (rect.width / 2) - 45) + 'px'
      
      const block = faqItem.closest('.editable-block') as HTMLElement
      if (selectedElement.value) selectedElement.value.classList.remove('selected')
      selectedElement.value = block
      selectedSubElement.value = faqItem
      block.classList.add('selected')
      activePanel.value = 'edit'

      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().selectElement(block, faqItem, true)
      })
      return
    } else {
      const existingSocialToolbar = doc.getElementById('social-inline-toolbar')
      if (existingSocialToolbar) existingSocialToolbar.style.display = 'none'
      const existingMetricToolbar = doc.getElementById('metric-inline-toolbar')
      if (existingMetricToolbar) existingMetricToolbar.style.display = 'none'
      const existingPricingToolbar = doc.getElementById('pricing-inline-toolbar')
      if (existingPricingToolbar) existingPricingToolbar.style.display = 'none'
      const existingFaqToolbar = doc.getElementById('faq-inline-toolbar')
      if (existingFaqToolbar) existingFaqToolbar.style.display = 'none'
    }

    if (target.closest('#floating-toolbar') || target.closest('#social-inline-toolbar') || target.closest('#metric-inline-toolbar') || target.closest('#pricing-inline-toolbar') || target.closest('#faq-inline-toolbar')) return
    if (target.closest('a')) e.preventDefault()
    
    if (target.tagName === 'IMG') {
      e.preventDefault()
      e.stopPropagation()
      const block = target.closest('.editable-block') as HTMLElement
      const sItem = target.closest('.social-item') as HTMLElement
      if (sItem && block) {
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          import('~/composables/useEditorState').then(({ useEditorState }) => {
             if (useEditorState().selectedSubElement.value === sItem) useBlockEditor().openImageModal(target as HTMLImageElement)
             else useBlockEditor().selectElement(block, sItem, true)
          })
        })
        return
      }
      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().openImageModal(target as HTMLImageElement)
      })
      return
    }

    const block = target.closest('.editable-block') as HTMLElement
    if (block) {
      const sub = target.closest('[data-toggle="title"], [data-toggle="subtitle"], [data-toggle="badge"], [data-toggle="image"], [data-toggle="button"], [data-toggle="ps"], [data-toggle="contact"], [data-toggle="pricing-feature"], .pricing-item, .faq-item, .social-item') as HTMLElement
      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().selectElement(block, sub || undefined)
      })
    } else {
      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().deselect()
      })
    }
  }, { signal })

  // ─── Toolbar & Other Events ────────────────────────────────────────────────
  const updateToolbar = () => {
    const toolbar = doc.getElementById('floating-toolbar')
    if (!toolbar) return
    const selection = doc.getSelection()
    if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
      toolbar.style.display = 'none'
      return
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    toolbar.style.display = 'flex'
    toolbar.style.top = rect.top - 50 + 'px'
    toolbar.style.left = rect.left + 'px'
    if (rect.top < 0 || rect.bottom > doc.documentElement.clientHeight) toolbar.style.display = 'none'
  }

  doc.addEventListener('mouseup', updateToolbar, { signal })
  doc.addEventListener('keyup', updateToolbar, { signal })
  doc.addEventListener('selectionchange', updateToolbar, { signal })
  doc.addEventListener('scroll', updateToolbar, { signal })

  doc.addEventListener('input', () => {
    refreshLayers()
    triggerAutosave()
  }, { signal })

  doc.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    isDraggingOverIframe.value = true
    const rect = iframeRef.value!.getBoundingClientRect()
    if (e.clientY < 100) iframeRef.value!.contentWindow?.scrollBy(0, -20)
    else if (e.clientY > rect.height - 100) iframeRef.value!.contentWindow?.scrollBy(0, 20)

    let placeholder = doc.getElementById('drop-placeholder')
    if (!placeholder) {
      placeholder = doc.createElement('div')
      placeholder.id = 'drop-placeholder'
      placeholder.className = 'drop-placeholder'
      placeholder.dataset.ignoreSave = 'true'
      placeholder.innerHTML = '<div class="drop-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></div>'
    }

    const target = e.target as HTMLElement
    const block = target.closest('.editable-block') as HTMLElement
    if (block) {
      const bRect = block.getBoundingClientRect()
      const isTop = e.clientY - bRect.top < bRect.height / 2
      const parentState = (window as any).editorState
      const dragged = (window as any).draggedElement || (parentState ? parentState.draggedLayer : null)
      if (dragged && (block === dragged || (block === dragged.previousElementSibling && !isTop) || (block === dragged.nextElementSibling && isTop))) {
        placeholder?.remove()
        return
      }
      if (isTop) block.parentNode?.insertBefore(placeholder, block)
      else block.after(placeholder)
    } else {
      const container = ensureMainCard(doc)
      if (placeholder.parentNode !== container) container.appendChild(placeholder)
    }
  }, { signal })

  doc.body.addEventListener('dragleave', (e: DragEvent) => {
    if (!e.relatedTarget || (e.relatedTarget as HTMLElement).tagName === 'HTML' || e.relatedTarget === doc.documentElement) {
      doc.getElementById('drop-placeholder')?.remove()
      isDraggingOverIframe.value = false
    }
  }, { signal })

  doc.body.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    isDraggingOverIframe.value = false
    const placeholder = doc.getElementById('drop-placeholder')
    const target = e.target as HTMLElement
    const block = target.closest('.editable-block') as HTMLElement
    const parentState = (window as any).editorState
    if (!parentState) { placeholder?.remove(); return; }

    if (parentState.draggedModule) {
      const t = doc.createElement('div')
      t.innerHTML = parentState.draggedModule as string
      const newBlock = t.firstElementChild as HTMLElement
      initBlock(newBlock, doc)
      newBlock.classList.add('module-drop-reveal')
      if (placeholder) placeholder.parentNode?.replaceChild(newBlock, placeholder)
      else {
        const container = ensureMainCard(doc)
        if (block && block.parentNode) {
          const rect = block.getBoundingClientRect()
          if (e.clientY - rect.top < rect.height / 2) block.parentNode.insertBefore(newBlock, block)
          else block.after(newBlock)
        } else container.appendChild(newBlock)
      }
      parentState.draggedModule = null
      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => useBlockEditor().selectElement(newBlock))
      applyStyleBase(useEditorState().currentStyle.value, false, newBlock)
      refreshLayers()
      import('~/composables/useTemplateManager').then(({ useTemplateManager }) => useTemplateManager().autoCreateTemplate())
      triggerAutosave(true)
    } else if (parentState.draggedLayer) {
      const layerEl = parentState.draggedLayer as HTMLElement
      if (placeholder) placeholder.parentNode?.replaceChild(layerEl, placeholder)
      else if (block) {
        const rect = block.getBoundingClientRect()
        if (e.clientY - rect.top < rect.height / 2) block.parentNode?.insertBefore(layerEl, block)
        else block.after(layerEl)
      } else ensureMainCard(doc).appendChild(layerEl)
      parentState.draggedLayer = null
      refreshLayers()
      triggerAutosave(true)
    } else if (window.draggedElement) {
      const dragged = window.draggedElement
      if (placeholder) placeholder.parentNode?.replaceChild(dragged, placeholder)
      else {
        const container = ensureMainCard(doc)
        if (block && block.parentNode) {
          const rect = block.getBoundingClientRect()
          if (e.clientY - rect.top < rect.height / 2) block.parentNode.insertBefore(dragged, block)
          else block.after(dragged)
        } else container.appendChild(dragged)
      }
      refreshLayers()
      triggerAutosave(true)
    } else placeholder?.remove()
  }, { signal })
}

// ─── Iframe Content Injection ────────────────────────────────────────────────

function injectIframeContent() {
  if (!iframeRef.value) return
  const doc = iframeRef.value.contentDocument || iframeRef.value.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(htmlContent.value)
  doc.close()

  // Restore style from metadata if present
  const styleId = doc.body.getAttribute('data-style-id')
  if (styleId) {
    const savedStyle = editorStyleBases.find(s => s.id === styleId)
    if (savedStyle) {
      useEditorState().currentStyle.value = savedStyle
    }
  }

  const style = doc.createElement('style')
  style.id = 'editor-styles'
  style.textContent = iframeEditorStyles
  doc.head.appendChild(style)

  injectFloatingToolbar(doc)

  // 1. Inicializar bloques que ya tengan clases identificativas (busqueda profunda)
  doc.querySelectorAll('.header-block, .body-block, .signature-block, .cta-block, .editable-block, [data-type]').forEach(el => {
    initBlock(el as HTMLElement, doc)
  })

  // 2. Asegurar que los hijos directos del contenedor principal sean bloques si parecen contenido
  const mainCard = doc.querySelector('.main-card') as HTMLElement
  const container = mainCard || doc.body

  if (mainCard) {
    mainCard.style.maxWidth = '820px'
    mainCard.style.width = '100%'
    mainCard.style.margin = '0 auto'
    mainCard.style.borderRadius = '0px'
    mainCard.style.overflow = 'hidden'
    
    // Ensure parent has lateral margins for mobile responsiveness
    const parent = mainCard.parentElement
    if (parent && parent !== doc.body) {
      // Adjusted to 0px lateral padding for edge-to-edge mobile experience as requested
      // parent.style.padding = '10px 0px'
      parent.style.boxSizing = 'border-box'
    }
  }

  if (container) {
    Array.from(container.children).forEach((child: any) => {
      if (
        child.id === 'floating-toolbar' ||
        child.id === 'drop-placeholder' ||
        ['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR'].includes(child.tagName) ||
        child.classList.contains('editable-block') // Ya procesado arriba
      ) return

      const hasContent = child.innerText.trim().length > 0 || child.querySelector('img, table, a, div')
      if (hasContent || child.tagName === 'DIV' || child.tagName === 'TABLE') {
        initBlock(child as HTMLElement, doc)
      }
    })
  }

  setupIframeEvents(doc)
  if (useEditorState().darkModePreview.value) {
    doc.documentElement.classList.add('dark-mode-simulation')
  }
  
  refreshLayers()
  
  // Apply current style base
  applyStyleBase(useEditorState().currentStyle.value, false)

  pushToHistory()
}

// ─── HTML Serialisation ──────────────────────────────────────────────────────

function applyStyleBase(style: EditorStyleBase, forceTheme = false, target?: HTMLElement) {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  
  if (!target) {
    // Apply body style
    doc.body.style.backgroundColor = style.config.bodyBg
    doc.body.style.fontFamily = style.config.fontFamily
    
    // Apply main-card style
    const mainCard = doc.querySelector('.main-card') as HTMLElement
    if (mainCard) {
      mainCard.style.maxWidth = '820px'
      mainCard.style.width = '100%'
      mainCard.style.margin = '0 auto'
      mainCard.style.backgroundColor = style.config.cardBg
      mainCard.style.borderRadius = style.config.cardRadius
      mainCard.style.boxShadow = style.config.cardShadow
      mainCard.style.border = style.config.cardBorder
    }
  }

  // Apply to blocks
  const blocks = target ? [target] : doc.querySelectorAll('.editable-block')
  blocks.forEach((block: any) => {
    // 0. Global Font Overrides for the block
    block.style.fontFamily = style.config.fontFamily
    block.querySelectorAll('*').forEach((el: any) => {
      // If it has a hardcoded font-family, override it with the theme font
      // unless it's already being handled by badge logic below
      if (el.style.fontFamily && !el.dataset.toggle?.includes('badge')) {
        el.style.fontFamily = style.config.fontFamily
      }
    })

    // 1. Content background & Borders
    if (!block.classList.contains('header-block')) {
      if (forceTheme || !block.dataset.customBg) {
        block.style.backgroundColor = style.config.contentBg
        block.style.background = style.config.contentBg
      }
      
      // Target all child divs and tables that might have hardcoded backgrounds or borders
      block.querySelectorAll('div, table, td').forEach((el: any) => {
        // If it has a background, force the theme background
        if (el.style.backgroundColor || el.getAttribute('background') || el.getAttribute('bgcolor')) {
          el.style.backgroundColor = style.config.contentBg
          if (el.hasAttribute('bgcolor')) el.setAttribute('bgcolor', style.config.contentBg)
        }
        
        // Update borders
        if (el.style.border || el.style.borderTop || el.style.borderBottom || el.style.borderLeft || el.style.borderRight) {
          // If it's a specialty border like the accent line in Note block, preserve the color if it's not the default gray
          const currentBorder = el.style.border || el.style.borderLeft
          if (currentBorder && !currentBorder.includes('#e2e8f0') && !currentBorder.includes('rgb(226, 232, 240)')) {
            // Keep it
          } else {
            if (el.style.border) el.style.borderColor = style.config.borderColor
            if (el.style.borderLeft) el.style.borderLeftColor = style.config.borderColor
            if (el.style.borderTop) el.style.borderTopColor = style.config.borderColor
            if (el.style.borderBottom) el.style.borderBottomColor = style.config.borderColor
            if (el.style.borderRight) el.style.borderRightColor = style.config.borderColor
          }
        }
      })
    } else {
      if (forceTheme || !block.dataset.customBg) {
        block.style.backgroundColor = style.config.headerBg
        block.style.background = style.config.headerBg
      }
    }

    // 2. Colors & Typography
    block.querySelectorAll('[data-toggle="title"]').forEach((el: any) => {
      el.style.color = style.config.titleColor
      if (style.config.titleLetterSpacing) {
        el.style.letterSpacing = style.config.titleLetterSpacing
      }
    })
    
    // Labels / Badges
    block.querySelectorAll('[data-toggle="badge"]').forEach((el: any) => {
      const isHeader = block.classList.contains('header-block')
      el.style.color = isHeader ? style.config.headerText : style.config.accentColor
      
      if (style.config.labelFontFamily) {
        el.style.fontFamily = style.config.labelFontFamily
        el.style.letterSpacing = '1.5px'
        el.style.textTransform = 'uppercase'
        el.style.fontSize = '10px'
      }
    })

    block.querySelectorAll('[data-toggle="subtitle"], [data-toggle="ps"], [data-toggle="contact"]').forEach((el: any) => {
      el.style.color = style.config.subtitleColor
      // Update link colors inside subtitles/contacts
      el.querySelectorAll('a').forEach((link: any) => {
        if (!link.dataset.toggle) link.style.color = style.config.accentColor
      })
    })
    
    // Header specific overrides
    if (block.classList.contains('header-block')) {
      block.querySelectorAll('[data-toggle="title"], [data-toggle="subtitle"]').forEach((el: any) => el.style.color = style.config.headerText)
    }

    // 3. Buttons
    block.querySelectorAll('[data-toggle="button"]').forEach((btn: any) => {
      if (forceTheme || !btn.dataset.customRadius) {
        btn.style.borderRadius = style.config.buttonRadius
      }
      if (forceTheme || !btn.dataset.customBg) {
        btn.style.backgroundColor = style.config.accentColor
        btn.style.background = style.config.accentColor
      }
    })
    // 4. Pricing items
    block.querySelectorAll('.pricing-item').forEach((item: any) => {
      const badge = Array.from(item.children).find(c => (c as HTMLElement).style.position === 'absolute' && ((c as HTMLElement).style.top === '-12px' || (c as HTMLElement).innerText.toUpperCase().includes('POPULAR')));
      if (badge) {
        (badge as HTMLElement).style.backgroundColor = style.config.accentColor;
        item.style.borderColor = style.config.accentColor;
      } else {
        item.style.borderColor = style.config.borderColor;
      }
    })
  })

  // Update the base <style> in head to keep it persistent for exports
  const headStyle = doc.querySelector('style:not(#editor-styles)')
  if (headStyle) {
    const cardCss = `.main-card {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      box-shadow: ${style.config.cardShadow};
      border: ${style.config.cardBorder};
      overflow: hidden;
    }`
    
    let css = `
      body { 
        margin: 0; 
        padding: 0; 
        font-family: ${style.config.fontFamily} !important; 
      }
      ${cardCss}
      .header-block { background-color: ${style.config.headerBg}; }
      .body-block, .card-block, .cta-block, .image-block, .grid-block, .methodology-block, .presence-block, .signature-block, .unsubscribe-block,
      .hero-block, .testimonials-block, .pricing-block, .video-block, .social-block, .divider-block, .faq-block { 
        background-color: ${style.config.contentBg}; 
      }
      .card-wrapper, .methodology-block > div, .presence-block > div, .grid-block td > div, .signature-block table td {
        background-color: ${style.config.contentBg} !important;
        border-color: ${style.config.borderColor} !important;
      }
      @media only screen and (max-width: 600px) {
        .main-card { border-radius: 0px !important; }
        .header-block, .body-block, .methodology-block, .presence-block, .card-block, .cta-block, .signature-block {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }
      }
    `
    headStyle.textContent = css
  }
}

function getSurgicalCleanHtml(): string {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return ''

  const clone = doc.documentElement.cloneNode(true) as HTMLElement

  clone.querySelectorAll('.visor-drag-handle').forEach((h) => h.remove())
  clone.querySelectorAll('#floating-toolbar, #social-inline-toolbar, #metric-inline-toolbar, #pricing-inline-toolbar, #faq-inline-toolbar').forEach((t) => t.remove())
  clone.querySelectorAll('#drop-placeholder').forEach((p) => p.remove())

  clone.querySelectorAll('.selected').forEach((s) => s.classList.remove('selected'))
  clone.querySelectorAll('.editable-block').forEach((s) => s.classList.remove('editable-block'))
  clone.querySelectorAll('.dragging').forEach((s) => s.classList.remove('dragging'))
  clone.querySelectorAll('.sub-selected-active').forEach((s) => s.classList.remove('sub-selected-active'))
  clone.querySelectorAll('.sub-selected-focus').forEach((s) => s.classList.remove('sub-selected-focus'))
  clone.querySelectorAll('.module-drop-reveal').forEach((m) => m.classList.remove('module-drop-reveal'))

  clone.querySelectorAll('[contenteditable]').forEach((el) => (el as HTMLElement).removeAttribute('contenteditable'))
  clone.querySelectorAll('[draggable]').forEach((el) => (el as HTMLElement).removeAttribute('draggable'))
  clone.querySelectorAll('[data-org-size]').forEach((el) => (el as HTMLElement).removeAttribute('data-org-size'))

  clone.querySelectorAll('#editor-styles').forEach(s => s.remove())

  // Save current style ID for restoration
  const styleId = useEditorState().currentStyle.value.id
  clone.querySelector('body')?.setAttribute('data-style-id', styleId)

  return '<!DOCTYPE html>\n' + clone.outerHTML
}

function updateHtml() {
  const html = getSurgicalCleanHtml()
  htmlContent.value = html
  if (typeof localStorage !== 'undefined' && html) {
    localStorage.setItem('editor_html_draft', html)
  }
}

// ─── Autosave ────────────────────────────────────────────────────────────────

function triggerAutosave(immediate = false) {
  updateHtml()

  if (immediate) {
    if (historyDebounce) clearTimeout(historyDebounce)
    pushToHistory()
    if (autosaveTimeout) clearTimeout(autosaveTimeout)
    import('~/composables/useTemplateManager').then(({ useTemplateManager }) => {
      useTemplateManager().saveTemplate(true)
    })
  } else {
    if (historyDebounce) clearTimeout(historyDebounce)
    historyDebounce = setTimeout(() => pushToHistory(), 800)
    if (autosaveTimeout) clearTimeout(autosaveTimeout)
    autosaveTimeout = setTimeout(() => {
      import('~/composables/useTemplateManager').then(({ useTemplateManager }) => {
        useTemplateManager().saveTemplate(true)
      })
    }, 2000)
  }
}

// ─── Reactive Watchers (call once from editor.vue setup) ──────────────────────

function setupEditorWatches() {
  watch(viewMode, () => {
    isMorphing.value = true
    setTimeout(() => (isMorphing.value = false), 500)
  })

  watch(
    [() => promptData.visible, () => activePanel.value],
    ([visible, panel]) => {
      const doc = iframeRef.value?.contentDocument
      if (!doc) return
      if ((visible && promptData.mode === 'color') || panel === 'fonts') {
        doc.body.classList.add('preview-active')
      } else {
        doc.body.classList.remove('preview-active')
      }
    },
  )
  
  watch(useEditorState().darkModePreview, (isDark) => {
    const doc = iframeRef.value?.contentDocument
    if (!doc) return
    if (isDark) {
      doc.documentElement.classList.add('dark-mode-simulation')
    } else {
      doc.documentElement.classList.remove('dark-mode-simulation')
    }
  })

}

export function useIframeEngine() {
  return {
    pushToHistory,
    restoreSnapshot,
    undo,
    redo,
    refreshLayers,
    initBlock,
    injectFloatingToolbar,
    setupIframeEvents,
    injectIframeContent,
    applyStyleBase,
    getSurgicalCleanHtml,
    updateHtml,
    triggerAutosave,
    setupEditorWatches,
  }
}
