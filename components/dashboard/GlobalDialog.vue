<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'
import { HelpCircle, Type } from 'lucide-vue-next'

const { dialogState } = useDashboardState()

const cancel = () => {
  if (dialogState.resolve) dialogState.resolve(null)
  dialogState.show = false
}

const confirm = () => {
  if (dialogState.resolve) {
    if (dialogState.type === 'prompt') {
      dialogState.resolve(dialogState.value)
    } else {
      dialogState.resolve(true)
    }
  }
  dialogState.show = false
}
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="dialogState.show" class="modal-overlay glass-modal">
      <div class="modal-window dialog-window">
        <div class="modal-content">
          <div class="modal-icon-container" :class="dialogState.type">
            <HelpCircle v-if="dialogState.type === 'confirm'" :size="32" />
            <Type v-else :size="32" />
          </div>
          <h3>{{ dialogState.title }}</h3>
          <p v-if="dialogState.message">{{ dialogState.message }}</p>
          
          <div v-if="dialogState.type === 'prompt'" class="prompt-input-wrapper">
            <input 
              v-model="dialogState.value" 
              type="text" 
              class="premium-input" 
              @keyup.enter="confirm"
              autofocus
            />
          </div>
        </div>
        <div class="modal-actions">
          <button @click="cancel" class="btn-modal-cancel">Cancelar</button>
          <button @click="confirm" class="btn-modal-confirm">
            {{ dialogState.type === 'prompt' ? 'Aceptar' : 'Confirmar' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-window {
  max-width: 360px;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6);
}
.modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.modal-icon-container {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.modal-icon-container.confirm {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent);
  border: 1px solid rgba(99, 102, 241, 0.2);
}
.modal-icon-container.prompt {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.modal-icon-container svg {
  width: 24px;
  height: 24px;
}
h3 {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 8px;
}
p {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
}
.prompt-input-wrapper {
  width: 100%;
  margin-top: 16px;
}
.premium-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 14px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.3s;
}
.premium-input:focus {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.05);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
}
.modal-actions {
  margin-top: 24px;
  display: flex;
  gap: 10px;
  width: 100%;
}
.modal-actions button {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-modal-cancel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-dim);
}
.btn-modal-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.btn-modal-confirm {
  background: var(--accent);
  border: none;
  color: #fff;
}
.btn-modal-confirm:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(99, 102, 241, 0.3);
}
</style>
