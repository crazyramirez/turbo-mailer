export type TextAlignment = 'left' | 'center' | 'right' | 'justify'

/** Resolve paragraphs from actual selected text, including ranges across modules. */
export function getSelectedTextBlocks(doc: Document, range: Range): HTMLElement[] {
  const result = new Set<HTMLElement>()
  const root = range.commonAncestorContainer
  const walker = doc.createTreeWalker(root.nodeType === 3 ? root.parentNode! : root)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeType !== 3 || !node.textContent?.trim() || !range.intersectsNode(node)) continue
    if (node === range.startContainer && range.startOffset === node.textContent.length) continue
    if (node === range.endContainer && range.endOffset === 0) continue
    let el = node.parentElement
    const module = el?.closest('.editable-block')
    if (!module || el?.closest('[data-ignore-save], .visor-drag-handle')) continue
    while (el && el !== module) {
      if (el.matches('p, h1, h2, h3, h4, h5, h6, li, blockquote, div, td, th, .email-button, a[data-toggle="button"], [data-toggle]:not(a)')) break
      el = el.parentElement
    }
    if (el) result.add(el)
  }
  return [...result]
}

export function alignSelectedText(doc: Document, range: Range, alignment: TextAlignment): boolean {
  const blocks = getSelectedTextBlocks(doc, range)
  blocks.forEach(block => {
    if (block.matches('span[data-toggle]')) block.style.display = 'block'
    block.style.textAlign = alignment
  })
  return blocks.length > 0
}
