/** DOM operations shared by the canvas and the module inspector. */
export function getGridTable(block: HTMLElement): HTMLTableElement | null {
  if (!block.matches('.grid-block, [data-type="Grid"]')) return null
  return block.querySelector('table')
}

export function getGridItems(block: HTMLElement): HTMLTableCellElement[] {
  const table = getGridTable(block)
  if (!table) return []
  return Array.from(table.rows).flatMap(row => Array.from(row.cells)).filter(cell =>
    cell.hasAttribute('valign') || !!cell.querySelector('[data-toggle], img, p, h1, h2, h3'),
  )
}

export function getGridColumns(block: HTMLElement): number {
  const explicit = Number(block.dataset.gridColumns)
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 4) return explicit
  const items = getGridItems(block)
  const counts = new Map<Element, number>()
  items.forEach(item => counts.set(item.parentElement!, (counts.get(item.parentElement!) || 0) + 1))
  return Math.min(4, Math.max(1, ...counts.values()))
}

/** Keep real nodes (and their selection/listeners), using email-safe table rows. */
export function layoutGrid(block: HTMLElement, items: HTMLTableCellElement[], columns = getGridColumns(block)): void {
  const table = getGridTable(block)
  if (!table || !items.length) return
  columns = Math.max(1, Math.min(4, Math.round(columns)))
  block.dataset.gridColumns = String(columns)
  const body = block.ownerDocument.createElement('tbody')
  for (let i = 0; i < items.length; i += columns) {
    const row = block.ownerDocument.createElement('tr')
    body.appendChild(row)
    const group = items.slice(i, i + columns)
    group.forEach(item => {
      item.colSpan = 12 / group.length
      item.removeAttribute('rowspan')
      item.setAttribute('width', `${100 / group.length}%`)
      item.setAttribute('valign', 'top')
      item.style.width = `${100 / group.length}%`
      item.style.padding = '6px'
      item.classList.toggle('grid-quad-td', columns === 4 && group.length > 1)
      row.appendChild(item)
    })
  }
  table.replaceChildren(body)
  table.classList.add('email-layout-table', 'email-grid-table', 'email-stack-table')
  table.style.tableLayout = 'fixed'
  table.style.width = '100%'
}

const partSelector = '[data-toggle], .faq-item, .social-item, .metric-item, .pricing-item, p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol'
const excluded = 'script, style, [data-ignore-save], .visor-drag-handle'

export function getModuleParts(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(partSelector)).filter(part => {
    if (part.closest(excluded)) return false
    let parent = part.parentElement
    while (parent && parent !== root) {
      if (parent.matches(partSelector)) return false
      parent = parent.parentElement
    }
    return true
  })
}

export function getMovableElement(target: HTMLElement, block: HTMLElement): HTMLElement | null {
  // A text selection inside a title moves the entire title, never a formatting span.
  const parts = getModuleParts(block)
  const outer = parts.find(part => part === target || part.contains(target))
  const candidates = outer ? [outer, ...getModuleParts(outer)] : []
  return candidates.reverse().find(part => (part === target || part.contains(target)) && getMovePeers(part, block).length > 1) || null
}

export function getMovePeers(part: HTMLElement, block: HTMLElement): HTMLElement[] {
  const gridItems = getGridItems(block)
  if (gridItems.includes(part as HTMLTableCellElement)) return gridItems
  if (!block.contains(part) || part === block || !part.parentElement) return []
  // Structural table cells must stay in their table; grids use layoutGrid above.
  if (part.matches('td, th, tr, tbody, table')) return []
  return Array.from(part.parentElement.children).filter((node): node is HTMLElement =>
    !node.matches(excluded) && !node.matches('td, th, tr, tbody') &&
    (!!node.textContent?.trim() || !!node.querySelector('img') || node.matches('img, hr')),
  )
}

export function moveModulePart(block: HTMLElement, part: HTMLElement, target: HTMLElement, after: boolean): boolean {
  const peers = getMovePeers(part, block)
  if (part === target || !peers.includes(target)) return false
  const order = peers.filter(item => item !== part)
  order.splice(order.indexOf(target) + Number(after), 0, part)
  if (order.every((item, index) => item === peers[index])) return false
  if (getGridItems(block).includes(part as HTMLTableCellElement)) {
    layoutGrid(block, order as HTMLTableCellElement[])
  } else if (after) target.after(part)
  else target.before(part)
  return true
}

export function cloneGridItem(item: HTMLTableCellElement): HTMLTableCellElement {
  const clone = item.cloneNode(true) as HTMLTableCellElement
  for (const el of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    el.removeAttribute('id')
    el.classList.remove('sub-selected-focus', 'sub-selected-active', 'tm-part-dragging')
    el.removeAttribute('data-org-size')
  }
  clone.querySelectorAll('[data-ignore-save]').forEach(el => el.remove())
  return clone
}
