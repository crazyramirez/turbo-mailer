<script setup lang="ts">
import { MousePointer2, Sparkles } from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useIframeEngine } from "~/composables/useIframeEngine";

const {
  iframeRef,
  viewMode,
  layerList,
  isTemplateLoading,
  isMorphing,
  isDraggingOverIframe,
  darkModePreview,
} = useEditorState();
const { injectIframeContent } = useIframeEngine();
</script>

<template>
  <main
    class="editor-viewport scroll-hide"
    :class="{ 'dark-mode-env': darkModePreview }"
  >
    <div
      class="canvas-box"
      :class="[
        viewMode,
        { 'template-loading': isTemplateLoading, morphing: isMorphing },
      ]"
    >
      <div class="iframe-host">
        <!-- Mobile frame decoration -->
        <div v-if="viewMode === 'mobile'" class="mobile-mockup-frame">
          <div class="frame-top"><div class="notch"></div></div>
          <div class="frame-bottom"><div class="home-bar"></div></div>
        </div>

        <!-- Empty canvas guide (Premium) -->
        <div
          v-if="
            layerList.length === 0 &&
            !isTemplateLoading &&
            !isMorphing &&
            !isDraggingOverIframe
          "
          class="canvas-empty-guide"
        >
          <div class="guide-premium-card">
            <div class="g-visual">
              <div class="g-icon-wrapper">
                <Sparkles :size="32" class="sparkle-icon" />
              </div>
              <div class="g-cursor-anim">
                <MousePointer2 :size="20" fill="currentColor" />
              </div>
            </div>
            <div class="g-content">
              <h3>Composición Interactiva</h3>
              <p>
                El lienzo está optimizado para diseños de alto impacto,
                visualmente funcional en gestores de correo. Arrastra módulos
                para comenzar.
              </p>
            </div>
            <div class="g-badges">
              <span class="g-badge">820px</span>
              <span class="g-badge">Premium UI</span>
              <span class="g-badge">Lucide Ready</span>
            </div>
          </div>
        </div>

        <iframe ref="iframeRef" @load="injectIframeContent"></iframe>

        <Transition name="fade">
          <div
            v-if="isDraggingOverIframe && layerList.length === 0"
            class="canvas-drag-overlay"
          >
            <div class="drag-hint">
              <div class="drag-icon-premium">
                <MousePointer2 :size="48" stroke-width="1" />
              </div>
              <span>Suelta para insertar módulo</span>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </main>
</template>
