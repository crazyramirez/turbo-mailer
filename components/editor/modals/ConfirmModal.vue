<script setup lang="ts">
import { X, AlertCircle } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'

const { confirmData } = useEditorState()

function close() {
  confirmData.visible = false
}

function handleConfirm() {
  confirmData.onConfirm()
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="confirmData.visible" class="modal-overlay high-z-confirm">
      <div class="modal-backdrop" @click="close"></div>
      <div class="modal-window confirm-modal-window">
        <div class="modal-header">
          <div class="header-info">
            <h2>{{ confirmData.title }}</h2>
          </div>
          <button @click="close" class="btn-close-minimal">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="confirm-content">
            <div class="icon-box" :class="confirmData.variant">
              <AlertCircle :size="32" />
            </div>
            <p>{{ confirmData.message }}</p>
          </div>

          <div class="modal-footer-actions">
            <button @click="close" class="btn-modal-secondary">
              {{ confirmData.cancelLabel || $t('editor.image_modal_cancel') }}
            </button>
            <button 
              @click="handleConfirm" 
              :class="[confirmData.variant === 'danger' ? 'btn-modal-danger' : 'premium-button']"
            >
              {{ confirmData.confirmLabel || $t('editor.template_delete_confirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<style>
.modal-overlay.high-z-confirm {
  z-index: 999999 !important;
}
</style>

<style scoped>
.confirm-modal-window {
  width: 440px;
  padding: 30px;
}

.confirm-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
  margin-bottom: 10px;
}

.icon-box {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-box.danger {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.icon-box.primary {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.confirm-content p {
  font-size: 16px;
  color: #94a3b8;
  line-height: 1.6;
  margin: 0;
}

.modal-header {
  margin-bottom: 24px;
}

.modal-header h2 {
  font-size: 20px;
}
</style>
