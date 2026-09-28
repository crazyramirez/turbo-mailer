import { useEditorState } from './useEditorState'
import { useIframeEngine } from './useIframeEngine'
import { useBlockEditor } from './useBlockEditor'
import { cloneGridItem, getGridItems, getGridColumns, getMovePeers, layoutGrid, moveModulePart } from '~/utils/editorComposition'

export function useModuleComposition() {
  const state = useEditorState()
  const engine = useIframeEngine()

  function finish(block: HTMLElement, part?: HTMLElement) {
    engine.initBlock(block, block.ownerDocument)
    useBlockEditor().selectElement(block, part, true)
    engine.refreshLayers()
    engine.triggerAutosave(true)
  }

  function addGridItem(item?: HTMLTableCellElement) {
    const block = state.selectedElement.value
    if (!block) return
    const items = getGridItems(block)
    const source = item || items.find(cell => cell.contains(state.selectedSubElement.value)) || items.at(-1)
    if (!source || items.length >= 12 || !items.includes(source)) return
    engine.pushToHistory()
    const clone = cloneGridItem(source)
    const columns = getGridColumns(block)
    items.splice(items.indexOf(source) + 1, 0, clone)
    layoutGrid(block, items, columns)
    finish(block, clone)
  }

  function removeGridItem(item: HTMLTableCellElement) {
    const block = state.selectedElement.value
    if (!block) return
    const items = getGridItems(block)
    const index = items.indexOf(item)
    if (items.length <= 1 || index < 0) return
    engine.pushToHistory()
    items.splice(index, 1)
    layoutGrid(block, items)
    finish(block, items[Math.min(index, items.length - 1)])
  }

  function setGridColumns(columns: number) {
    const block = state.selectedElement.value
    if (!block || !Number.isInteger(columns) || columns < 1 || columns > 4 || columns === getGridColumns(block)) return
    const items = getGridItems(block)
    if (!items.length) return
    engine.pushToHistory()
    layoutGrid(block, items, columns)
    finish(block, state.selectedSubElement.value || undefined)
  }

  function movePart(part: HTMLElement, direction: -1 | 1) {
    const block = state.selectedElement.value
    if (!block) return
    const peers = getMovePeers(part, block)
    const target = peers[peers.indexOf(part) + direction]
    if (!target) return
    engine.pushToHistory()
    if (moveModulePart(block, part, target, direction === 1)) finish(block, part)
  }

  return { addGridItem, removeGridItem, setGridColumns, movePart }
}
