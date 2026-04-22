<script setup lang="ts">
import { X, FileJson } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useTemplateManager } from '~/composables/useTemplateManager'

const { showTemplateModal, newTemplateName } = useEditorState()
const { createNewTemplate } = useTemplateManager()
</script>

<template>
  <Transition name="fade">
    <div v-if="showTemplateModal" class="modal-overlay">
      <div class="modal-backdrop" @click="showTemplateModal = false"></div>
      <div class="modal-window">
        <div class="modal-header">
          <div class="header-info">
            <h2>Nueva Plantilla</h2>
            <p>Clona el diseño actual en un nuevo archivo</p>
          </div>
          <button @click="showTemplateModal = false" class="btn-close-minimal">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <div class="input-modern-group">
            <input
              v-model="newTemplateName"
              type="text"
              placeholder="ej: campaña_verano"
              @keyup.enter="createNewTemplate"
              autofocus
            />
            <FileJson :size="18" class="input-icon" />
          </div>
          <div class="modal-footer-actions">
            <button @click="showTemplateModal = false" class="btn-modal-secondary">Cancelar</button>
            <button @click="createNewTemplate" class="premium-button">Crear Plantilla</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
