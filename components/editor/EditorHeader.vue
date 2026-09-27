<script setup lang="ts">
import {
  ArrowLeft,
  Monitor,
  Smartphone,
  Undo,
  Redo,
  Clock,
  Save,
  Moon,
  Sun,
  Download,
  Sparkles,
} from "lucide-vue-next";
import { computed } from "vue";
import { APP_VERSION } from "~/utils/version";

const { t } = useI18n();
const {
  viewMode,
  undoStack,
  redoStack,
  lastSavedTime,
  currentTemplate,
  isSaving,
  darkModePreview,
  showAITemplateModal,
  desktopPreviewWidth,
  mobilePreviewWidth,
} = useEditorState();
const previewWidth = computed({
  get: () => viewMode.value === 'mobile' ? mobilePreviewWidth.value : desktopPreviewWidth.value,
  set: (width: number) => {
    if (viewMode.value === 'mobile') mobilePreviewWidth.value = width;
    else desktopPreviewWidth.value = width;
  },
});
const previewWidths = computed(() => viewMode.value === 'mobile' ? [320, 375, 414] : [600, 700, 820]);
const { undo, redo } = useIframeEngine();
const { handleSave, saveTemplate, downloadHtml } = useTemplateManager();

async function handleBack() {
  if (currentTemplate.value) {
    await saveTemplate(true);
  }
  const router = useRouter();
  if (window.history.state && window.history.state.back) {
    router.back();
  } else {
    navigateTo("/dashboard");
  }
}
</script>

<template>
  <header class="editor-header" style="user-select: none">
    <div class="header-section left">
      <button @click="handleBack" class="btn-action-back">
        <ArrowLeft :size="18" /> <span>{{ t("editor.back") }}</span>
      </button>
      <div class="h-divider"></div>
      <div class="editor-brand">
        <div class="brand-icon-wrapper">
          <img
            :src="'/images/icons/web-app-manifest-192x192.png'"
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
      <div class="viewport-capsule" role="group" :aria-label="t('editor.studio_preview')">
        <button
          @click="viewMode = 'desktop'"
          :class="{ active: viewMode === 'desktop' }"
          :aria-pressed="viewMode === 'desktop'"
          :title="t('editor.studio_desktop')"
          class="v-pill"
        >
          <Monitor :size="14" /> <span>{{ t('editor.studio_desktop') }}</span>
        </button>
        <button
          @click="viewMode = 'mobile'"
          :class="{ active: viewMode === 'mobile' }"
          :aria-pressed="viewMode === 'mobile'"
          :title="t('editor.studio_mobile')"
          class="v-pill"
        >
          <Smartphone :size="14" /> <span>{{ t('editor.studio_mobile') }}</span>
        </button>
      </div>
      <select v-model="previewWidth" class="preview-width-select" :aria-label="t('editor.studio_preview_width')" :title="t('editor.studio_preview_width')">
        <option v-for="width in previewWidths" :key="width" :value="width">{{ width }} px</option>
      </select>
      <button
        @click="darkModePreview = !darkModePreview"
        class="btn-dark-mode"
        :class="{ active: darkModePreview }"
        :aria-pressed="darkModePreview"
        :aria-label="darkModePreview ? t('editor.dark_mode_off') : t('editor.dark_mode_on')"
        :title="
          darkModePreview ? t('editor.dark_mode_off') : t('editor.dark_mode_on')
        "
      >
        <component :is="darkModePreview ? Sun : Moon" :size="16" />
        <span class="d-label">{{
          darkModePreview ? t("editor.light") : t("editor.dark")
        }}</span>
      </button>
      <div class="h-divider"></div>
      <div class="history-controls">
        <button
          @click="undo"
          :disabled="undoStack.length <= 1"
          class="btn-history"
          :title="t('editor.undo')"
          :aria-label="t('editor.undo')"
        >
          <Undo :size="16" />
        </button>
        <button
          @click="redo"
          :disabled="redoStack.length === 0"
          class="btn-history"
          :title="t('editor.redo')"
          :aria-label="t('editor.redo')"
        >
          <Redo :size="16" />
        </button>
      </div>
    </div>

    <div class="header-section right">
      <div v-if="lastSavedTime" class="save-indicator">
        <Clock :size="12" /> <span>{{ lastSavedTime }}</span>
      </div>
      <div v-if="currentTemplate" class="active-template-tag" :title="currentTemplate + '.html'">
        <span>{{ currentTemplate + ".html" }}</span>
      </div>

      <button
        @click="downloadHtml"
        class="btn-secondary-download"
        :title="t('editor.download')"
        :aria-label="t('editor.download')"
      >
        <Download :size="16" />
      </button>

      <button
        @click="showAITemplateModal = true"
        class="btn-secondary-download"
        :title="t('editor.studio_start_ai')"
        :aria-label="t('editor.studio_start_ai')"
        style="color: #6366f1; border-color: rgba(99, 102, 241, 0.3);"
      >
        <Sparkles :size="16" />
      </button>

      <button @click="handleSave" :disabled="isSaving" class="btn-premium-save">
        <Save v-if="!isSaving" :size="16" />
        <span>{{ isSaving ? t("editor.saving") : t("editor.save") }}</span>
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
