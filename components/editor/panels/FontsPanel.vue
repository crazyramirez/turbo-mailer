<script setup lang="ts">
import { ChevronLeft, CheckCircle2 } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useBlockEditor } from '~/composables/useBlockEditor'
import { safeFonts } from '~/utils/editorFonts'

const { selectedElement } = useEditorState()
const { applyFont, previewFont, cancelFontSelection } = useBlockEditor()
</script>

<template>
  <div class="fonts-sidebar-panel">
    <div class="panel-header-minimal">
      <button @click="cancelFontSelection" class="btn-back-panel">
        <ChevronLeft :size="16" /> Editar Bloque
      </button>
    </div>
    <div class="fonts-scrollable custom-scrollbar">
      <div v-for="section in safeFonts" :key="section.group" class="font-section-compact">
        <span class="section-tag">{{ section.group }}</span>
        <div class="font-minimal-grid">
          <button
            v-for="f in section.fonts"
            :key="f.name"
            @click="applyFont(f.family)"
            @mouseenter="previewFont(f.family)"
            @mouseleave="selectedElement ? previewFont(selectedElement.style.fontFamily) : null"
            :class="{ selected: selectedElement?.style?.fontFamily?.includes(f.name) }"
            class="font-item-card"
            :style="{ fontFamily: f.family }"
          >
            <div class="font-item-info">
              <span class="f-item-name">{{ f.name }}</span>
              <span class="f-item-previewText">The quick brown fox</span>
            </div>
            <CheckCircle2
              v-if="selectedElement?.style.fontFamily.includes(f.name)"
              :size="16"
              class="check-active"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
