<script setup lang="ts">
import { X, Image as ImageIcon, MousePointer2 } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useBlockEditor } from '~/composables/useBlockEditor'

const { imageModal } = useEditorState()
const { applyImageSettings } = useBlockEditor()
</script>

<template>
  <Transition name="fade">
    <div v-if="imageModal.visible" class="modal-overlay">
      <div class="modal-backdrop" @click="imageModal.visible = false"></div>
      <div class="modal-window wide-modal">
        <div class="modal-header">
          <div class="header-info">
            <h2>Configurar Recurso</h2>
            <p>Gestiona el enlace y la fuente visual del elemento</p>
          </div>
          <button @click="imageModal.visible = false" class="btn-close-minimal">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="image-settings-layout">
            <div class="preview-capsule">
              <div
                class="premium-img-preview"
                :style="{ backgroundImage: `url(${imageModal.src})` }"
              >
                <div v-if="!imageModal.src" class="no-img-msg">Sin imagen</div>
              </div>
              <div class="preview-tag">VISTA PREVIA</div>
            </div>
            <div class="settings-form-side">
              <div class="premium-field-group">
                <label>URL del Recurso</label>
                <div class="premium-input-box">
                  <ImageIcon :size="18" class="field-icon" />
                  <input v-model="imageModal.src" type="text" placeholder="https://..." />
                </div>
              </div>
              <div class="premium-field-group">
                <label>Enlace de Destino</label>
                <div class="premium-input-box">
                  <MousePointer2 :size="18" class="field-icon" />
                  <input v-model="imageModal.link" type="text" placeholder="https://..." />
                </div>
              </div>
              <div class="premium-toggle-card">
                <div class="toggle-info">
                  <span class="t-label">Nueva Pestaña</span>
                  <span class="t-sub">Abrir en target="_blank"</span>
                </div>
                <button
                  @click="imageModal.target = imageModal.target === '_blank' ? '_self' : '_blank'"
                  :class="{ active: imageModal.target === '_blank' }"
                  class="premium-switch"
                >
                  {{ imageModal.target === '_blank' ? 'ACTIVADO' : 'DESACTIVADO' }}
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer-actions">
            <button @click="imageModal.visible = false" class="btn-modal-secondary">Cancelar</button>
            <button @click="applyImageSettings" class="premium-button" style="margin-top: 0">
              Actualizar Recurso
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
