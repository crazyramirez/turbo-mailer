import { getGridItems, getMovableElement, getMovePeers, moveModulePart } from './editorComposition'
import { getPartDrop } from './editorPartDrop'

interface PartDragOptions {
  signal: AbortSignal
  beforeChange: () => void
  onChange: (block: HTMLElement, part: HTMLElement) => void
  hint: string
}

/** Long press leaves ordinary clicks, caret movement and text selection untouched. */
export function setupPartDragging(doc: Document, options: PartDragOptions): void {
  const { signal } = options
  let pending: ReturnType<typeof setTimeout> | undefined
  let source: HTMLElement | null = null
  let block: HTMLElement | null = null
  let active = false
  let pointerId = -1
  let startX = 0
  let startY = 0
  let suppressClickUntil = 0
  let marker: HTMLElement | null = null
  let badge: HTMLElement | null = null

  const reset = () => {
    clearTimeout(pending)
    pending = undefined
    if (source?.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId)
    source?.classList.remove('tm-part-dragging')
    doc.body.classList.remove('tm-reordering')
    marker?.remove()
    badge?.remove()
    marker = badge = null
    source = block = null
    active = false
  }
  const candidate = (el: HTMLElement, module: HTMLElement) => getMovableElement(el, module) ||
    getGridItems(module).find(cell => cell === el || cell.contains(el)) || null

  doc.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.isPrimary || (e.target as HTMLElement).closest('[data-ignore-save], .visor-drag-handle, #floating-toolbar')) return
    reset()
    const el = e.target as HTMLElement
    block = el.closest<HTMLElement>('.editable-block')
    if (!block) return
    source = candidate(el, block)
    if (!source || getMovePeers(source, block).length < 2) { reset(); return }
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    pending = setTimeout(() => {
      pending = undefined
      if (!source?.isConnected) { reset(); return }
      active = true
      source.setPointerCapture?.(pointerId)
      doc.getSelection()?.removeAllRanges()
      source.classList.add('tm-part-dragging')
      doc.body.classList.add('tm-reordering')
      doc.getElementById('drop-placeholder')?.remove()
      marker = doc.createElement('div')
      marker.className = 'tm-part-drop-guide'
      marker.dataset.ignoreSave = 'true'
      badge = doc.createElement('div')
      badge.className = 'tm-part-drag-hint'
      badge.dataset.ignoreSave = 'true'
      badge.textContent = options.hint
      badge.style.left = `${Math.max(8, Math.min(startX, (doc.defaultView?.innerWidth || 800) - 240))}px`
      badge.style.top = `${Math.max(8, startY - 42)}px`
      doc.body.append(marker, badge)
    }, 450)
  }, { signal })

  doc.addEventListener('pointermove', e => {
    if (e.pointerId !== pointerId || !source || !block) return
    if (!active) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) reset()
      return
    }
    e.preventDefault()
    const drop = getPartDrop(block, source, e.clientX, e.clientY)
    if (marker) {
      if (!drop) marker.style.display = 'none'
      else {
        const { left, top, width, height } = drop.guide
        marker.style.cssText = `display:block;left:${left}px;top:${top}px;width:${width}px;height:${height}px`
      }
    }
    const height = doc.defaultView?.innerHeight || 800
    if (e.clientY < 60) doc.defaultView?.scrollBy(0, -16)
    else if (e.clientY > height - 60) doc.defaultView?.scrollBy(0, 16)
  }, { signal, passive: false })

  doc.addEventListener('pointerup', e => {
    if (e.pointerId !== pointerId) return
    if (active) {
      e.preventDefault()
      suppressClickUntil = Date.now() + 350
      const drop = source && block ? getPartDrop(block, source, e.clientX, e.clientY) : null
      if (source && block && drop) {
        options.beforeChange()
        if (moveModulePart(block, source, drop.target, drop.after)) options.onChange(block, source)
      }
    }
    reset()
  }, { signal })
  doc.addEventListener('click', e => {
    if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation() }
  }, { signal, capture: true })
  doc.addEventListener('dragstart', e => {
    const el = e.target as HTMLElement
    if (el.closest('.visor-drag-handle')) return
    const module = el.closest<HTMLElement>('.editable-block')
    if (active || pending || module && candidate(el, module)) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }, { signal, capture: true })
  doc.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (active || pending)) {
      suppressClickUntil = Date.now() + 350
      reset()
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }, { signal, capture: true })
  doc.addEventListener('pointercancel', reset, { signal })
  doc.addEventListener('lostpointercapture', reset, { signal })
  doc.defaultView?.addEventListener('blur', reset, { signal })
  signal.addEventListener('abort', reset, { once: true })
}
