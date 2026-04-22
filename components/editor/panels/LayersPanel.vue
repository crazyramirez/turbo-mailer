<script setup lang="ts">
import { GripVertical, ChevronUp, ChevronDown, MousePointer2 } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useBlockEditor } from '~/composables/useBlockEditor'

const { layerList, selectedElement, isTemplateLoading } = useEditorState()
const { selectElement, moveLayer, handleLayerDragStart, handleLayerDragEnd, handleLayerDrop } = useBlockEditor()
</script>

<template>
  <div class="layers-stack">
    <TransitionGroup :name="isTemplateLoading ? '' : 'layer-list'">
      <div
        v-for="(layer, index) in layerList"
        :key="layer.id"
        class="stack-item"
        :class="{ active: selectedElement === layer.el }"
        draggable="true"
        @dragstart="handleLayerDragStart(layer.el, $event)"
        @dragend="handleLayerDragEnd($event)"
        @dragover.prevent
        @drop="handleLayerDrop(index, $event)"
        @click="selectElement(layer.el)"
      >
        <GripVertical :size="14" class="grip" />
        <div class="stack-info">
          <span class="s-type">{{ layer.type }}</span>
          <span class="s-text">{{ layer.text }}</span>
        </div>
        <div class="stack-nav">
          <button
            @click.stop="moveLayer(index, 'up')"
            :disabled="index === 0"
            class="btn-nav-up"
          >
            <ChevronUp :size="14" />
          </button>
          <button
            @click.stop="moveLayer(index, 'down')"
            :disabled="index === layerList.length - 1"
            class="btn-nav-down"
          >
            <ChevronDown :size="14" />
          </button>
        </div>
      </div>
    </TransitionGroup>

    <div v-if="layerList.length === 0" class="empty-layers-placeholder">
      <MousePointer2 :size="40" class="p-icon" />
      <h4>Estructura Vacía</h4>
      <p>Arrastra módulos desde la izquierda para comenzar tu diseño</p>
    </div>
  </div>
</template>
