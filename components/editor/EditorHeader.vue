<script setup lang="ts">
import { ArrowLeft, Layout, Monitor, Smartphone, Undo, Redo, Clock, Lock, Save } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useIframeEngine } from '~/composables/useIframeEngine'
import { useTemplateManager } from '~/composables/useTemplateManager'

const { viewMode, undoStack, redoStack, lastSavedTime, currentTemplate, isSaving } = useEditorState()
const { undo, redo } = useIframeEngine()
const { handleSave } = useTemplateManager()
</script>

<template>
  <header class="editor-header">
    <div class="header-section left">
      <button @click="navigateTo('/')" class="btn-action-back">
        <ArrowLeft :size="18" /> <span>Volver</span>
      </button>
      <div class="h-divider"></div>
      <div class="editor-brand">
        <Layout :size="18" class="brand-icon" /> <span>TurboEditor</span>
      </div>
    </div>

    <div class="header-section center">
      <div class="viewport-capsule">
        <button
          @click="viewMode = 'desktop'"
          :class="{ active: viewMode === 'desktop' }"
          class="v-pill"
        >
          <Monitor :size="14" /> <span>Desktop</span>
        </button>
        <button
          @click="viewMode = 'mobile'"
          :class="{ active: viewMode === 'mobile' }"
          class="v-pill"
        >
          <Smartphone :size="14" /> <span>Mobile</span>
        </button>
      </div>
      <div class="history-controls">
        <button
          @click="undo"
          :disabled="undoStack.length <= 1"
          class="btn-history"
          title="Deshacer (Ctrl+Z)"
        >
          <Undo :size="16" />
        </button>
        <button
          @click="redo"
          :disabled="redoStack.length === 0"
          class="btn-history"
          title="Rehacer (Ctrl+Y)"
        >
          <Redo :size="16" />
        </button>
      </div>
    </div>

    <div class="header-section right">
      <div v-if="lastSavedTime" class="save-indicator">
        <Clock :size="12" /> <span>{{ lastSavedTime }}</span>
      </div>
      <div class="active-template-tag">
        <Lock v-if="currentTemplate === 'email_demo'" :size="12" class="demo-lock" />
        <span>{{ currentTemplate === 'email_demo' ? 'Base Template' : currentTemplate + '.html' }}</span>
      </div>
      <button @click="handleSave" :disabled="isSaving" class="btn-premium-save">
        <Save v-if="!isSaving" :size="16" />
        <span>{{ isSaving ? 'Guardando' : 'Guardar' }}</span>
      </button>
    </div>
  </header>
</template>
