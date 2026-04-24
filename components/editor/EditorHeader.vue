<script setup lang="ts">
import {
  ArrowLeft,
  Monitor,
  Smartphone,
  Undo,
  Redo,
  Clock,
  Lock,
  Save,
  Moon,
  Sun,
} from "lucide-vue-next";
import { APP_VERSION } from "~/utils/version";

const { t } = useI18n()
const {
  viewMode,
  undoStack,
  redoStack,
  lastSavedTime,
  currentTemplate,
  isSaving,
  darkModePreview,
} = useEditorState();
const { undo, redo } = useIframeEngine();
const { handleSave, saveTemplate } = useTemplateManager();

async function handleBack() {
  if (currentTemplate.value) {
    await saveTemplate(true);
  }
  const router = useRouter();
  if (window.history.state && window.history.state.back) {
    router.back();
  } else {
    navigateTo("/");
  }
}
</script>

<template>
  <header class="editor-header" style="user-select: none">
    <div class="header-section left">
      <button @click="handleBack" class="btn-action-back">
        <ArrowLeft :size="18" /> <span>{{ t('editor.back') }}</span>
      </button>
      <div class="h-divider"></div>
      <div class="editor-brand">
        <div class="brand-icon-wrapper">
          <img
            src="/images/icons/web-app-manifest-192x192.png"
            class="brand-img"
            alt="Logo"
          />
        </div>
        <div class="brand-title">
          <span style="color: #ffffff">Turbo</span>
          <span style="color: var(--primary); margin-left: 4px">Editor</span>
          <span class="editor-version">{{ APP_VERSION }}</span>
        </div>
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
      <div class="h-divider" style="margin: 0 12px"></div>
      <button
        @click="darkModePreview = !darkModePreview"
        class="btn-dark-mode"
        :class="{ active: darkModePreview }"
        :title="darkModePreview ? t('editor.dark_mode_off') : t('editor.dark_mode_on')"
      >
        <component :is="darkModePreview ? Sun : Moon" :size="16" />
        <span class="d-label">{{ darkModePreview ? t('editor.light') : t('editor.dark') }}</span>
      </button>
      <div class="h-divider" style="margin: 0 12px"></div>
      <div class="history-controls">
        <button
          @click="undo"
          :disabled="undoStack.length <= 1"
          class="btn-history"
          :title="t('editor.undo')"
        >
          <Undo :size="16" />
        </button>
        <button
          @click="redo"
          :disabled="redoStack.length === 0"
          class="btn-history"
          :title="t('editor.redo')"
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
        <span>{{ currentTemplate ? currentTemplate + ".html" : "" }}</span>
      </div>

      <button @click="handleSave" :disabled="isSaving" class="btn-premium-save">
        <Save v-if="!isSaving" :size="16" />
        <span>{{ isSaving ? t('editor.saving') : t('editor.save') }}</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.editor-version {
  font-size: 8px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.brand-title {
  display: flex;
  align-items: center;
  font-weight: 700;
}

.brand-icon-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.brand-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
