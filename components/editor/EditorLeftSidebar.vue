<script setup lang="ts">
import { Plus, Edit3, Trash2, Lock } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useTemplateManager } from '~/composables/useTemplateManager'
import { useBlockEditor } from '~/composables/useBlockEditor'
import { editorBlocks } from '~/utils/editorBlocks'

const { templates, currentTemplate, showTemplateModal } = useEditorState()
const { loadTemplate, deleteTemplate, renameTemplate } = useTemplateManager()
const { handleSidebarDragStart, handleSidebarDragEnd } = useBlockEditor()
</script>

<template>
  <aside class="side-nav left">
    <!-- Templates -->
    <div class="nav-group">
      <div class="group-header">
        <h3>Plantillas</h3>
        <button @click="showTemplateModal = true" class="btn-small-add">
          <Plus :size="14" />
        </button>
      </div>
      <div class="nav-list custom-scrollbar">
        <div v-for="t in templates" :key="t.name" class="nav-item-wrapper">
          <button
            @click="loadTemplate(t.name)"
            :class="{ active: currentTemplate === t.name }"
            class="nav-item"
          >
            <div class="nav-item-content">
              <span>{{ t.name }}</span>
            </div>
            <div class="nav-item-actions">
              <button @click.stop="renameTemplate(t.name)" class="btn-item-action" title="Renombrar">
                <Edit3 :size="12" />
              </button>
              <button @click.stop="deleteTemplate(t.name)" class="btn-item-action delete" title="Eliminar">
                <Trash2 :size="12" />
              </button>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Modules -->
    <div class="nav-group modules">
      <div class="group-header"><h3>Módulos</h3></div>
      <div class="modules-grid custom-scrollbar">
        <div
          v-for="block in editorBlocks"
          :key="block.id"
          draggable="true"
          @dragstart="handleSidebarDragStart(block.content, $event)"
          @dragend="handleSidebarDragEnd($event)"
          class="module-card"
        >
          <component :is="block.icon" :size="20" class="mod-icon" />
          <span>{{ block.name }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>
