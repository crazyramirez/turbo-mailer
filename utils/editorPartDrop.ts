import { getGridItems, getGridTable, getMovePeers } from './editorComposition'

interface PartBox { element: HTMLElement; rect: DOMRect }
interface Guide { left: number; top: number; width: number; height: number }
export interface PartDrop { target: HTMLElement; after: boolean; guide: Guide }

// Determine the target row independently of the dragged element's original row.
function sameRow(a: DOMRect, b: DOMRect): boolean {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return overlap > Math.min(a.height, b.height) / 2 &&
    (a.right <= b.left + 1 || b.right <= a.left + 1)
}

function horizontalRow(boxes: PartBox[], index: number): boolean {
  const rect = boxes[index].rect
  return !!boxes[index - 1] && sameRow(rect, boxes[index - 1].rect) ||
    !!boxes[index + 1] && sameRow(rect, boxes[index + 1].rect)
}

function leftToRightRow(boxes: PartBox[], index: number): boolean {
  const rect = boxes[index].rect
  const next = boxes[index + 1]?.rect
  if (next && sameRow(rect, next)) return rect.left < next.left
  return boxes[index - 1].rect.left < rect.left
}

/** Both sides of a margin refer to the same slot and the same guide. */
function slotGuide(boxes: PartBox[], slot: number): Guide {
  const previous = boxes[slot - 1]?.rect
  const next = boxes[slot]?.rect
  if (previous && next && sameRow(previous, next)) {
    const leftToRight = previous.left < next.left
    return {
      left: ((leftToRight ? previous.right + next.left : next.right + previous.left) / 2) - 1.5,
      top: Math.min(previous.top, next.top), width: 3,
      height: Math.max(previous.bottom, next.bottom) - Math.min(previous.top, next.top),
    }
  }
  const index = next ? slot : slot - 1
  const rect = boxes[index].rect
  if (horizontalRow(boxes, index)) {
    const atRightEdge = leftToRightRow(boxes, index) ? !next : !!next
    return { left: (atRightEdge ? rect.right : rect.left) - 1.5, top: rect.top, width: 3, height: rect.height }
  }
  return {
    left: Math.min(previous?.left ?? rect.left, next?.left ?? rect.left),
    top: (previous && next ? (previous.bottom + next.top) / 2 : next ? next.top : previous!.bottom) - 1.5,
    width: Math.max(previous?.right ?? rect.right, next?.right ?? rect.right) - Math.min(previous?.left ?? rect.left, next?.left ?? rect.left),
    height: 3,
  }
}

/** Resolve visible insertion slots without introducing any node into the layout. */
export function getPartDrop(block: HTMLElement, source: HTMLElement, x: number, y: number): PartDrop | null {
  const doc = block.ownerDocument
  const scope = getGridItems(block).includes(source as HTMLTableCellElement) ? getGridTable(block) : source.parentElement
  const hit = doc.elementFromPoint(x, y)
  if (!scope || !hit || !scope.contains(hit) || source.contains(hit)) return null

  const boxes = getMovePeers(source, block).map(element => ({ element, rect: element.getBoundingClientRect() })).filter(({ element, rect }) => {
    const style = doc.defaultView!.getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility)
  })
  const sourceIndex = boxes.findIndex(box => box.element === source)
  if (sourceIndex < 0 || boxes.length < 2) return null
  const index = boxes.findIndex(box => box.element.contains(hit))
  let slot: number
  if (index >= 0) {
    const rect = boxes[index].rect
    const horizontal = horizontalRow(boxes, index)
    const leftToRight = !horizontal || leftToRightRow(boxes, index)
    const after = horizontal ? (x > rect.left + rect.width / 2) === leftToRight : y > rect.top + rect.height / 2
    slot = index + Number(after)
  } else {
    // Padding and margins belong to the nearest existing slot, not an extra item.
    let nearest = Infinity
    slot = 0
    for (let i = 0; i <= boxes.length; i++) {
      const guide = slotGuide(boxes, i)
      const dx = Math.max(guide.left - x, 0, x - guide.left - guide.width)
      const dy = Math.max(guide.top - y, 0, y - guide.top - guide.height)
      const distance = dx * dx + dy * dy
      if (distance < nearest) { nearest = distance; slot = i }
    }
  }
  // Before and after the source are the same position once it is removed.
  if (slot === sourceIndex || slot === sourceIndex + 1) return null
  return {
    target: boxes[slot]?.element || boxes[slot - 1].element,
    after: slot === boxes.length,
    guide: slotGuide(boxes, slot),
  }
}
