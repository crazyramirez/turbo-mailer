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
            <h2>{{ $t('editor.image_modal_title') }}</h2>
            <p>{{ $t('editor.image_modal_subtitle') }}</p>
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
                <div v-if="!imageModal.src" class="no-img-msg">{{ $t('editor.image_modal_no_image') }}</div>
              </div>
              <div class="preview-tag">{{ $t('editor.image_modal_preview') }}</div>
            </div>
            <div class="settings-form-side">
              <div class="premium-field-group">
                <label>{{ $t('editor.image_modal_url') }}</label>
                <div class="premium-input-box">
                  <ImageIcon :size="18" class="field-icon" />
                  <input v-model="imageModal.src" type="text" placeholder="https://..." />
                </div>
              </div>
              <div class="premium-field-group">
                <label>{{ $t('editor.image_modal_link') }}</label>
                <div class="premium-input-box">
                  <MousePointer2 :size="18" class="field-icon" />
                  <input v-model="imageModal.link" type="text" placeholder="https://..." />
                </div>
              </div>
              <div class="premium-toggle-card">
                <div class="toggle-info">
                  <span class="t-label">{{ $t('editor.image_modal_new_tab') }}</span>
                  <span class="t-sub">{{ $t('editor.image_modal_new_tab_sub') }}</span>
                </div>
                <button
                  @click="imageModal.target = imageModal.target === '_blank' ? '_self' : '_blank'"
                  :class="{ active: imageModal.target === '_blank' }"
                  class="premium-switch"
                >
                  {{ imageModal.target === '_blank' ? $t('editor.image_modal_on') : $t('editor.image_modal_off') }}
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer-actions">
            <button @click="imageModal.visible = false" class="btn-modal-secondary">{{ $t('editor.image_modal_cancel') }}</button>
            <button @click="applyImageSettings" class="premium-button" style="margin-top: 0">
              {{ $t('editor.image_modal_update') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
