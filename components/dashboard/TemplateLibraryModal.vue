<script setup lang="ts">
import { X, Check, Pencil, Trash2 } from "lucide-vue-next";
import { useDashboardState } from "~/composables/useDashboardState";
import { useHtmlImport } from "~/composables/useHtmlImport";

const {
  showTemplatesModal,
  internalTemplates,
  libraryId,
  showToast,
  showDialog,
} = useDashboardState();
const { selectInternalTemplate, deleteTemplate, renameTemplate } =
  useHtmlImport();

const handleRename = async (name: string) => {
  const newName = await showDialog({
    type: "prompt",
    title: "Renombrar Plantilla",
    defaultValue: name,
  });
  if (newName && newName !== name) {
    renameTemplate(name, newName);
  }
};
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="showTemplatesModal" class="modal-overlay glass-modal">
      <div class="modal-window library-window">
        <div class="library-header">
          <div class="header-titles">
            <h2>Biblioteca</h2>
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
                  :src="`${t.path}&t=${libraryId}`"
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
              <div class="info-main">
                <span class="template-name">{{ t.name }}</span>
                <span class="template-type">HTML Email v1.0</span>
              </div>
              <div class="info-actions">
                <button
                  @click.stop="handleRename(t.name)"
                  class="btn-action-small"
                  title="Renombrar"
                >
                  <Pencil :size="14" />
                </button>
                <button
                  @click.stop="deleteTemplate(t.name)"
                  class="btn-action-small btn-danger"
                  title="Eliminar"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.library-window {
  max-width: 1000px;
  width: 95%;
  max-height: 85vh;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 32px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.library-header {
  padding: 24px 32px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-titles h2 {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
}
.header-titles p {
  color: var(--text-muted);
  font-size: 13px;
}
.btn-close-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-close-modal:hover {
  background: var(--red);
  color: #fff;
  border-color: var(--red);
}
.library-grid {
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
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
  transform: translateY(-4px);
  background: rgba(99, 102, 241, 0.05);
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.3);
}
.template-preview-mock {
  height: 160px;
  background: #111420;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.mock-browser-bar {
  padding: 6px 10px;
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
  z-index: 5;
}
.mock-browser-bar span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-hi);
}
.iframe-wrapper {
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background: #fff;
}
.mini-preview-frame {
  width: 1200px;
  height: 900px;
  border: none;
  transform: scale(0.18);
  transform-origin: 0 0;
  pointer-events: none;
  user-select: none;
}
.template-overlay {
  position: absolute;
  inset: 0;
  background: rgba(99, 102, 241, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s;
  backdrop-filter: blur(4px);
  cursor: pointer;
}
.template-card:hover .template-overlay {
  opacity: 1;
}
.btn-select-template {
  background: #fff;
  color: var(--accent);
  border: none;
  padding: 8px 16px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateY(10px);
  transition: transform 0.3s;
}
.template-card:hover .btn-select-template {
  transform: translateY(0);
}
.template-info {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.info-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.template-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.template-type {
  font-size: 10px;
  color: var(--text-dim);
  font-weight: 800;
  text-transform: uppercase;
  margin-top: 2px;
}
.info-actions {
  display: flex;
  gap: 4px;
  opacity: 0.3;
  transition: opacity 0.2s;
}
.template-card:hover .info-actions {
  opacity: 1;
}
.btn-action-small {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-action-small:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.btn-action-small.btn-danger:hover {
  background: var(--red);
  border-color: var(--red);
}
</style>
