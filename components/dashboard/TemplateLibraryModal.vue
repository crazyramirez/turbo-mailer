<script setup lang="ts">
import { X, Check } from 'lucide-vue-next'
import { useDashboardState } from '~/composables/useDashboardState'
import { useHtmlImport } from '~/composables/useHtmlImport'

const { showTemplatesModal, internalTemplates, libraryId } = useDashboardState()
const { selectInternalTemplate } = useHtmlImport()
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="showTemplatesModal" class="modal-overlay glass-modal">
      <div class="modal-window library-window">
        <div class="library-header">
          <div class="header-titles">
            <h2>Biblioteca de Plantillas</h2>
            <p>Selecciona un diseño profesional para tu campaña</p>
          </div>
          <button @click="showTemplatesModal = false" class="btn-close-modal">
            <X :size="20" />
          </button>
        </div>

        <div class="library-grid">
          <div
            v-for="t in internalTemplates"
            :key="t.name"
            class="template-card"
            @click="selectInternalTemplate(t.name)"
          >
            <div class="template-preview-mock">
              <div class="mock-browser-bar">
                <span></span><span></span><span></span>
              </div>
              <div class="iframe-wrapper">
                <iframe
                  :src="`/templates/${t.name}.html?t=${libraryId}`"
                  class="mini-preview-frame"
                  scrolling="no"
                ></iframe>
              </div>
              <div class="template-overlay">
                <button class="btn-select-template">
                  <Check :size="20" />
                  <span>Usar esta</span>
                </button>
              </div>
            </div>
            <div class="template-info">
              <span class="template-name">{{ t.name }}</span>
              <span class="template-type">HTML Email v1.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.library-window {
  max-width: 900px;
  width: 90%;
  max-height: 80vh;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 32px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.library-header {
  padding: 32px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.header-titles h2 { font-size: 24px; font-weight: 800; color: #fff; }
.header-titles p { color: var(--text-muted); font-size: 14px; }
.btn-close-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-close-modal:hover { background: var(--red); color: #fff; border-color: var(--red); }
.library-grid {
  padding: 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 24px;
  overflow-y: auto;
}
.template-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.template-card:hover {
  border-color: var(--accent);
  transform: translateY(-8px);
  background: rgba(99, 102, 241, 0.05);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}
.template-preview-mock {
  height: 200px;
  background: #111420;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.mock-browser-bar {
  padding: 8px 12px;
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
  z-index: 5;
}
.mock-browser-bar span { width: 6px; height: 6px; border-radius: 50%; background: var(--border-hi); }
.iframe-wrapper { flex: 1; width: 100%; height: 100%; overflow: hidden; position: relative; background: #fff; }
.mini-preview-frame {
  width: 1000px;
  height: 800px;
  border: none;
  transform: scale(0.24);
  transform-origin: 0 0;
  pointer-events: none;
  user-select: none;
}
.template-overlay {
  position: absolute;
  inset: 0;
  background: rgba(99, 102, 241, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s;
  backdrop-filter: blur(4px);
}
.template-card:hover .template-overlay { opacity: 1; }
.btn-select-template {
  background: #fff;
  color: var(--accent);
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateY(10px);
  transition: transform 0.3s;
}
.template-card:hover .btn-select-template { transform: translateY(0); }
.template-info { padding: 16px; display: flex; flex-direction: column; }
.template-name { font-size: 15px; font-weight: 700; color: #fff; }
.template-type { font-size: 11px; color: var(--text-dim); font-weight: 800; text-transform: uppercase; margin-top: 4px; }
</style>
