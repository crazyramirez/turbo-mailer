<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUp, ArrowDown, Copy, Plus, Trash2, GripVertical, Layers } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useBlockEditor } from '~/composables/useBlockEditor'
import { useModuleComposition } from '~/composables/useModuleComposition'
import { getGridItems, getGridColumns, getModuleParts, getMovePeers } from '~/utils/editorComposition'

const { selectedElement, selectedSubElement, refreshLayersTrigger } = useEditorState()
const { selectElement } = useBlockEditor()
const { addGridItem, removeGridItem, setGridColumns, movePart } = useModuleComposition()
const gridItems = computed(() => {
  void refreshLayersTrigger.value
  return selectedElement.value ? getGridItems(selectedElement.value) : []
})
const columns = computed(() => {
  void refreshLayersTrigger.value
  return selectedElement.value ? getGridColumns(selectedElement.value) : 1
})
const selectedItem = computed(() => gridItems.value.find(item => item === selectedSubElement.value || item.contains(selectedSubElement.value)))
const parts = computed(() => {
  void refreshLayersTrigger.value
  const nested = selectedSubElement.value?.closest<HTMLElement>('.pricing-item, .metric-item, .faq-item')
  const root = selectedItem.value || (nested && selectedElement.value?.contains(nested) ? nested : selectedElement.value)
  return root ? getModuleParts(root) : []
})
const isSelected = (part: HTMLElement) => part === selectedSubElement.value
const label = (part: HTMLElement, index: number) => (part.querySelector('[data-toggle="title"]')?.textContent || part.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) || part.querySelector('img')?.alt || (part.querySelector('img') ? '' : `#${index + 1}`)
function canMove(part: HTMLElement, direction: -1 | 1) {
  if (!selectedElement.value) return false
  const peers = getMovePeers(part, selectedElement.value)
  return !!peers[peers.indexOf(part) + direction]
}
function choose(part: HTMLElement) {
  if (!selectedElement.value) return
  selectElement(selectedElement.value, part, true)
  part.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
</script>

<template>
  <section v-if="parts.length || gridItems.length" class="composition-panel" :aria-label="$t('editor.module_structure')">
    <div class="composition-heading"><Layers :size="15" /><strong>{{ $t('editor.module_structure') }}</strong></div>
    <p class="composition-help">{{ $t('editor.reorder_help') }}</p>

    <template v-if="gridItems.length">
      <div class="composition-heading"><span>{{ $t('editor.grid_items') }}</span><span class="composition-count">{{ gridItems.length }} / 12</span></div>
      <div class="composition-columns" role="group" :aria-label="$t('editor.grid_columns')">
        <span>{{ $t('editor.grid_columns') }}</span>
        <button v-for="count in 4" :key="count" type="button" :aria-pressed="columns === count" :class="{ active: columns === count }" @click="setGridColumns(count)">{{ count }}</button>
      </div>
      <ol class="composition-list">
        <li v-for="(item, index) in gridItems" :key="index" :class="{ active: selectedItem === item }">
          <button type="button" class="composition-name" :aria-pressed="selectedItem === item" @click="choose(item)"><span class="composition-index">{{ index + 1 }}</span><span>{{ label(item, index) }}</span></button>
          <div class="composition-actions">
            <button type="button" :title="$t('editor.part_up')" :aria-label="$t('editor.part_up')" :disabled="index === 0" @click="movePart(item, -1)"><ArrowUp :size="13" /></button>
            <button type="button" :title="$t('editor.part_down')" :aria-label="$t('editor.part_down')" :disabled="index === gridItems.length - 1" @click="movePart(item, 1)"><ArrowDown :size="13" /></button>
            <button type="button" :title="$t('editor.grid_duplicate')" :aria-label="$t('editor.grid_duplicate')" :disabled="gridItems.length >= 12" @click="addGridItem(item)"><Copy :size="13" /></button>
            <button type="button" class="composition-remove" :title="$t('editor.grid_remove')" :aria-label="$t('editor.grid_remove')" :disabled="gridItems.length <= 1" @click="removeGridItem(item)"><Trash2 :size="13" /></button>
          </div>
        </li>
      </ol>
      <button type="button" class="composition-add" :disabled="gridItems.length >= 12" @click="addGridItem()"><Plus :size="14" />{{ $t('editor.grid_add') }}</button>
      <p class="composition-help">{{ $t('editor.grid_help') }}</p>
    </template>

    <template v-if="parts.length && (!gridItems.length || selectedItem)">
      <div class="composition-heading"><span>{{ $t('editor.module_elements') }}</span><span class="composition-count">{{ parts.length }}</span></div>
      <ol class="composition-list">
        <li v-for="(part, index) in parts" :key="index" :class="{ active: isSelected(part) }">
          <button type="button" class="composition-name" :aria-pressed="isSelected(part)" @click="choose(part)"><GripVertical :size="13" /><span>{{ label(part, index) || $t('editor.edit_image') }}</span></button>
          <div class="composition-actions">
            <button type="button" :title="$t('editor.part_up')" :aria-label="$t('editor.part_up')" :disabled="!canMove(part, -1)" @click="movePart(part, -1)"><ArrowUp :size="13" /></button>
            <button type="button" :title="$t('editor.part_down')" :aria-label="$t('editor.part_down')" :disabled="!canMove(part, 1)" @click="movePart(part, 1)"><ArrowDown :size="13" /></button>
          </div>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.composition-panel { padding: 14px; border: 1px solid #334155; background: linear-gradient(145deg, #172238, #101a2d); border-radius: 12px; margin-bottom: 20px; }
.composition-heading { display: flex; align-items: center; gap: 8px; color: #cbd5e1; font-size: 12px; margin-bottom: 10px; }
.composition-heading strong { color: #e0e7ff; }
.composition-count { margin-left: auto; color: #a5b4fc; font-size: 11px; font-variant-numeric: tabular-nums; }
.composition-help { color: #94a3b8; font-size: 11px; line-height: 1.6; margin: 0 0 12px; }
.composition-columns { display: flex; align-items: center; gap: 4px; margin: 8px 0 12px; }
.composition-columns span { flex: 1; color: #94a3b8; font-size: 11px; }
.composition-panel button { font: inherit; cursor: pointer; border: 0; }
.composition-columns button { width: 28px; height: 28px; border-radius: 6px; background: #1e293b; color: #cbd5e1; font-size: 12px; }
.composition-columns button.active { background: #4f46e5; color: white; }
.composition-list { list-style: none; padding: 0; margin: 0 0 10px; display: flex; flex-direction: column; gap: 5px; }
.composition-list li { display: flex; flex-wrap: wrap; align-items: center; border: 1px solid #29374e; border-radius: 8px; background: #101a2b; min-width: 0; }
.composition-list li.active { border-color: #818cf8; background: #20294a; }
.composition-name { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 70px; padding: 10px 6px; background: transparent; color: #cbd5e1; text-align: left; font-size: 11px !important; }
.composition-name span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composition-name svg { flex-shrink: 0; color: #818cf8; }
.composition-index { color: #818cf8; font-variant-numeric: tabular-nums; }
.composition-actions { display: flex; gap: 1px; padding: 3px; margin-left: auto; }
.composition-actions button { display: flex; align-items: center; justify-content: center; width: 25px; height: 28px; border-radius: 5px; color: #94a3b8; background: transparent; }
.composition-actions button:hover:not(:disabled) { background: #334155; color: white; }
.composition-actions .composition-remove:hover:not(:disabled) { background: #7f1d1d; color: #fecaca; }
.composition-panel button:disabled { opacity: .3; cursor: default; }
.composition-add { width: 100%; display: flex; justify-content: center; align-items: center; gap: 7px; color: #c7d2fe; background: #312e81; padding: 10px; border-radius: 8px; font-size: 12px !important; margin-bottom: 10px; }
</style>
