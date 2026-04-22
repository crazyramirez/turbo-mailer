<script setup lang="ts">
import { useEditorState } from '~/composables/useEditorState'
import { useIframeEngine } from '~/composables/useIframeEngine'

const { iframeRef, viewMode, layerList, isTemplateLoading, isMorphing } = useEditorState()
const { injectIframeContent } = useIframeEngine()
</script>

<template>
  <main class="editor-viewport scroll-hide">
    <div
      class="canvas-box"
      :class="[viewMode, { 'template-loading': isTemplateLoading, morphing: isMorphing }]"
    >
      <div class="iframe-host">
        <!-- Mobile frame decoration -->
        <div v-if="viewMode === 'mobile'" class="mobile-mockup-frame">
          <div class="frame-top"><div class="notch"></div></div>
          <div class="frame-bottom"><div class="home-bar"></div></div>
        </div>

        <iframe ref="iframeRef" @load="injectIframeContent"></iframe>

        <!-- Empty canvas overlay -->
        <div v-if="layerList.length === 0 && !isTemplateLoading" class="canvas-empty-overlay">
          <div class="overlay-card">
            <div class="o-icon">✨</div>
            <h2>Empieza tu Diseño</h2>
            <p>Arrastra módulos desde el panel izquierdo hacia el centro para construir tu email</p>
            <div class="overlay-animation-hint">
              <div class="pulse-ring"></div>
              <span>Listo para recibir módulos</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
