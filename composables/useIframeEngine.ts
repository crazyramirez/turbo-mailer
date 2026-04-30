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
              doc.body.focus()
              doc.execCommand('foreColor', false, color)
              triggerAutosave(true)
            }
          })
        }
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

// ─── Iframe Events ───────────────────────────────────────────────────────────

function setupIframeEvents(doc: Document) {
  if (iframeEventsController) iframeEventsController.abort()
  iframeEventsController = new AbortController()
  const { signal } = iframeEventsController

  // Keyboard shortcuts
  doc.addEventListener(
    'keydown',
    (e: any) => {
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
    },
    { signal },
  )

  // Click handler
  doc.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement
      if (target.closest('a')) e.preventDefault()
      if (target.closest('#floating-toolbar')) {
        e.stopPropagation()
        return
      }
      if (target.tagName === 'IMG') {
        e.preventDefault()
        e.stopPropagation()
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          useBlockEditor().openImageModal(target as HTMLImageElement)
        })
        return
      }
      const block = target.closest('.editable-block') as HTMLElement
      if (block) {
        const sub = target.closest(
          '[data-toggle="title"], [data-toggle="subtitle"], [data-toggle="badge"], [data-toggle="image"], [data-toggle="button"], [data-toggle="ps"], [data-toggle="contact"]',
        ) as HTMLElement
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          useBlockEditor().selectElement(block, sub || undefined)
        })
      } else {
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          useBlockEditor().deselect()
        })
      }
    },
    { signal },
  )

  // Floating toolbar visibility
  const updateToolbar = () => {
    const toolbar = doc.getElementById('floating-toolbar')
    if (!toolbar) return
    const selection = doc.getSelection()
    if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
      toolbar.style.display = 'none'
      return
    }
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    toolbar.style.display = 'flex'
    toolbar.style.top = rect.top - 50 + 'px'
    toolbar.style.left = rect.left + rect.width / 2 - toolbar.offsetWidth / 2 + 'px'
    if (rect.top < 0 || rect.bottom > doc.documentElement.clientHeight) {
      toolbar.style.display = 'none'
    }
    toolbar.querySelectorAll('button').forEach((btn) => {
      const cmd = btn.dataset.cmd
      if (cmd && ['bold', 'italic', 'underline'].includes(cmd)) {
        doc.queryCommandState(cmd) ? btn.classList.add('active') : btn.classList.remove('active')
      }
    })
  }

  doc.addEventListener('mouseup', updateToolbar, { signal })
  doc.addEventListener('keyup', updateToolbar, { signal })
  doc.addEventListener('selectionchange', updateToolbar, { signal })
  doc.addEventListener('scroll', updateToolbar, { signal })

  doc.addEventListener(
    'input',
    () => {
      refreshLayers()
      triggerAutosave()
    },
    { signal },
  )

  // Drag-over: placeholder + auto-scroll
  doc.addEventListener(
    'dragover',
    (e: DragEvent) => {
      e.preventDefault()
      isDraggingOverIframe.value = true
      const target = e.target as HTMLElement
      const block = target.closest('.editable-block') as HTMLElement

      const scrollThreshold = 100
      const scrollSpeed = 20
      const rect = iframeRef.value!.getBoundingClientRect()
      if (e.clientY < scrollThreshold) {
        iframeRef.value!.contentWindow?.scrollBy(0, -scrollSpeed)
      } else if (e.clientY > rect.height - scrollThreshold) {
        iframeRef.value!.contentWindow?.scrollBy(0, scrollSpeed)
      }

      let placeholder = doc.getElementById('drop-placeholder')
      if (!placeholder) {
        placeholder = doc.createElement('div')
        placeholder.id = 'drop-placeholder'
        placeholder.className = 'drop-placeholder'
        placeholder.dataset.ignoreSave = 'true'
        placeholder.innerHTML = `
          <div class="drop-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
        `
      }

      if (block) {
        const bRect = block.getBoundingClientRect()
        const isTop = e.clientY - bRect.top < bRect.height / 2

        // Evitar posiciones redundantes al arrastrar un elemento del propio visor
        const parentState = (window as any).editorState
        const dragged = (window as any).draggedElement || (parentState ? parentState.draggedLayer : null)
        
        if (dragged) {
          // Si es el mismo bloque, es redundante en cualquier mitad
          if (block === dragged) {
            placeholder?.remove()
            return
          }
          // Si es el anterior y estamos en su mitad inferior, es su posición actual
          if (block === dragged.previousElementSibling && !isTop) {
            placeholder?.remove()
            return
          }
          // Si es el siguiente y estamos en su mitad superior, es su posición actual
          if (block === dragged.nextElementSibling && isTop) {
            placeholder?.remove()
            return
          }
        }

        if (isTop) block.parentNode?.insertBefore(placeholder, block)
        else block.after(placeholder)
      } else {
        const container = doc.querySelector('.main-card') || doc.body
        if (placeholder.parentNode !== container) container.appendChild(placeholder)
      }
    },
    { signal },
  )

  doc.body.addEventListener(
    'dragleave',
    (e: DragEvent) => {
      if (!e.relatedTarget || (e.relatedTarget as HTMLElement).tagName === 'HTML' || e.relatedTarget === doc.documentElement) {
        doc.getElementById('drop-placeholder')?.remove()
        isDraggingOverIframe.value = false
      }
    },
    { signal },
  )

  doc.body.addEventListener(
    'drop',
    (e: DragEvent) => {
      e.preventDefault()
      isDraggingOverIframe.value = false
      const placeholder = doc.getElementById('drop-placeholder')
      const target = e.target as HTMLElement
      const block = target.closest('.editable-block') as HTMLElement
      const parentState = (window as any).editorState

      if (!parentState) {
        placeholder?.remove()
        return
      }

      if (parentState.draggedModule) {
        const content = parentState.draggedModule as string
        const t = doc.createElement('div')
        t.innerHTML = content
        const newBlock = t.firstElementChild as HTMLElement
        initBlock(newBlock, doc)
        newBlock.classList.add('module-drop-reveal')
        newBlock.addEventListener('animationend', () => newBlock.classList.remove('module-drop-reveal'), { once: true })

        if (placeholder) placeholder.parentNode?.replaceChild(newBlock, placeholder)
        else {
          const container = doc.querySelector('.main-card') || doc.body
          if (block && block.parentNode) {
            const rect = block.getBoundingClientRect()
            if (e.clientY - rect.top < rect.height / 2) block.parentNode.insertBefore(newBlock, block)
            else block.after(newBlock)
          } else container.appendChild(newBlock)
        }

        parentState.draggedModule = null
        import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
          useBlockEditor().selectElement(newBlock)
        })
        refreshLayers()
        
        import('~/composables/useTemplateManager').then(({ useTemplateManager }) => {
          useTemplateManager().autoCreateTemplate()
        })
        
        triggerAutosave(true)
      } else if (parentState.draggedLayer) {
        const layerEl = parentState.draggedLayer as HTMLElement
        if (placeholder) placeholder.parentNode?.replaceChild(layerEl, placeholder)
        else if (block) {
          const rect = block.getBoundingClientRect()
          if (e.clientY - rect.top < rect.height / 2) block.parentNode?.insertBefore(layerEl, block)
          else block.after(layerEl)
        } else doc.querySelector('.main-card')?.appendChild(layerEl)
        parentState.draggedLayer = null
        refreshLayers()
        triggerAutosave(true)
      } else if (window.draggedElement) {
        const dragged = window.draggedElement
        if (placeholder) placeholder.parentNode?.replaceChild(dragged, placeholder)
        else {
          const container = doc.querySelector('.main-card') || doc.body
          if (block && block.parentNode) {
            const rect = block.getBoundingClientRect()
            if (e.clientY - rect.top < rect.height / 2) block.parentNode.insertBefore(dragged, block)
            else block.after(dragged)
          } else container.appendChild(dragged)
        }
        refreshLayers()
        triggerAutosave(true)
      } else {
        placeholder?.remove()
      }
    },
    { signal },
  )
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
  applyStyleBase(useEditorState().currentStyle.value)

  pushToHistory()
}

// ─── HTML Serialisation ──────────────────────────────────────────────────────

function applyStyleBase(style: EditorStyleBase) {
  const doc = iframeRef.value?.contentDocument
  if (!doc) return
  
  // Apply body style
  doc.body.style.backgroundColor = style.config.bodyBg
  doc.body.style.fontFamily = style.config.fontFamily
  
  // Apply main-card style
  const mainCard = doc.querySelector('.main-card') as HTMLElement
  if (mainCard) {
    mainCard.style.backgroundColor = style.config.cardBg
    mainCard.style.borderRadius = style.config.cardRadius
    mainCard.style.boxShadow = style.config.cardShadow
    mainCard.style.border = style.config.cardBorder
  }

  // Apply to blocks
  doc.querySelectorAll('.editable-block').forEach((block: any) => {
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
      block.style.backgroundColor = style.config.contentBg
      
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
      block.style.backgroundColor = style.config.headerBg
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
      btn.style.borderRadius = style.config.buttonRadius
      btn.style.backgroundColor = style.config.accentColor
    })
  })

  // Update the base <style> in head to keep it persistent for exports
  const headStyle = doc.querySelector('style:not(#editor-styles)')
  if (headStyle) {
    const cardCss = `.main-card {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      background: ${style.config.cardBg};
      border-radius: ${style.config.cardRadius};
      box-shadow: ${style.config.cardShadow};
      border: ${style.config.cardBorder};
      overflow: hidden;
    }`
    
    let css = `
      body { 
        margin: 0; 
        padding: 0; 
        background-color: ${style.config.bodyBg}; 
        font-family: ${style.config.fontFamily} !important; 
      }
      ${cardCss}
      .header-block { background-color: ${style.config.headerBg} !important; }
      .body-block, .card-block, .cta-block, .image-block, .grid-block, .methodology-block, .presence-block, .signature-block, .unsubscribe-block { 
        background-color: ${style.config.contentBg} !important; 
      }
      .card-wrapper, .methodology-block > div, .presence-block > div, .grid-block td > div, .signature-block table td {
        background-color: ${style.config.contentBg} !important;
        border-color: ${style.config.borderColor} !important;
      }
      @media only screen and (max-width: 600px) {
        .main-card { border-radius: 20px !important; }
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
  clone.querySelectorAll('#floating-toolbar').forEach((t) => t.remove())
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
  htmlContent.value = getSurgicalCleanHtml()
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

  watch(useEditorState().currentStyle, (style) => {
    applyStyleBase(style)
    triggerAutosave(true)
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
