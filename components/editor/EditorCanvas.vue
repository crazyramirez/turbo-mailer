<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { MousePointer2, Sparkles } from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useIframeEngine } from "~/composables/useIframeEngine";

const { t } = useI18n();
const {
  iframeRef, viewMode, layerList, isTemplateLoading, isMorphing,
  isDraggingOverIframe, darkModePreview, desktopPreviewWidth,
  mobilePreviewWidth, previewZoom, showAITemplateModal,
} = useEditorState();
const { handleIframeLoad } = useIframeEngine();
const viewport = ref<HTMLElement | null>(null);
const availableWidth = ref(900);
const availableHeight = ref(800);
const contentWidth = computed(() => viewMode.value === 'mobile' ? mobilePreviewWidth.value : desktopPreviewWidth.value);
const frameWidth = computed(() => contentWidth.value + (viewMode.value === 'mobile' ? 24 : 0));
const scale = computed(() => previewZoom.value === 'fit' ? Math.min(1, Math.max(0.1, availableWidth.value / frameWidth.value)) : 1);
const frameHeight = computed(() => viewMode.value === 'mobile' ? 760 : Math.max(560, Math.floor(availableHeight.value / scale.value)));
let resizeObserver: ResizeObserver | undefined;
function measureViewport() {
  if (!viewport.value) return;
  availableWidth.value = Math.max(1, viewport.value.clientWidth - 48);
  availableHeight.value = Math.max(1, viewport.value.clientHeight - 94);
}
onMounted(() => {
  measureViewport();
  if (typeof ResizeObserver !== 'undefined' && viewport.value) {
    resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(viewport.value);
  }
  window.addEventListener('resize', measureViewport);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', measureViewport);
});
</script>

<template>
  <main ref="viewport" class="editor-viewport scroll-hide" :class="{ 'dark-mode-env': darkModePreview }" :aria-label="t('editor.studio_preview')">
    <div class="canvas-toolbar">
      <span class="canvas-status">{{ t('editor.studio_canvas_status', { width: contentWidth, zoom: Math.round(scale * 100), count: layerList.length }) }}</span>
      <select v-model="previewZoom" class="preview-zoom-select" :aria-label="t('editor.studio_preview_zoom')" :title="t('editor.studio_preview_zoom')">
        <option value="fit">{{ t('editor.studio_fit') }}</option>
        <option :value="100">100% · {{ t('editor.studio_actual_size') }}</option>
      </select>
    </div>
    <!-- The iframe always keeps the chosen CSS width. Only its outer frame is scaled;
         fitting the workspace must never accidentally activate the email's mobile layout. -->
    <div class="canvas-stage" :style="{ width: `${frameWidth * scale}px`, height: `${frameHeight * scale}px` }">
      <div class="canvas-box" :class="[viewMode, { 'template-loading': isTemplateLoading, morphing: isMorphing }]" :style="{ width: `${frameWidth}px`, height: `${frameHeight}px`, transform: `scale(${scale})` }">
        <div class="iframe-host">
          <div v-if="layerList.length === 0 && !isTemplateLoading && !isMorphing && !isDraggingOverIframe" class="canvas-empty-guide">
            <div class="guide-premium-card">
              <div class="g-visual"><div class="g-icon-wrapper"><Sparkles :size="32" class="sparkle-icon" /></div></div>
              <div class="g-content">
                <h3>{{ t('editor.studio_start_title') }}</h3>
                <p>{{ t('editor.studio_start_desc') }}</p>
              </div>
              <button class="canvas-start-button" @click="showAITemplateModal = true"><Sparkles :size="16" />{{ t('editor.studio_start_ai') }}</button>
              <div class="g-badges"><span class="g-badge">{{ t('editor.studio_start_modules') }}</span></div>
            </div>
          </div>
          <iframe ref="iframeRef" :title="t('editor.studio_preview')" :style="{ width: `${contentWidth}px` }" @load="handleIframeLoad"></iframe>
          <Transition name="fade">
            <div v-if="isDraggingOverIframe && layerList.length === 0" class="canvas-drag-overlay">
              <div class="drag-hint"><div class="drag-icon-premium"><MousePointer2 :size="48" stroke-width="1" /></div><span>{{ t('editor.canvas_drop_hint') }}</span></div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </main>
</template>
