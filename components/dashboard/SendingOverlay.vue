<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const { isSending, selectedEmails } = useDashboardState()
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="isSending" class="sending-overlay">
      <div class="sending-panel">
        <div class="sending-spinner">
          <svg viewBox="0 0 50 50" class="spinner-svg">
            <circle cx="25" cy="25" r="20" fill="none" stroke="#6366f1" stroke-width="4"
              stroke-linecap="round" stroke-dasharray="80 45" />
          </svg>
          <div class="sending-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polyline points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
        </div>
        <h3>Enviando campaña...</h3>
        <p>{{ selectedEmails.length }} destinatarios en cola. No cierres la ventana.</p>
        <div class="sending-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sending-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 7, 15, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.sending-panel {
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 28px;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.7), 0 0 60px rgba(99, 102, 241, 0.08);
  min-width: 320px;
}

.sending-spinner {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
}

.spinner-svg {
  width: 72px;
  height: 72px;
  animation: spin 1.2s linear infinite;
  position: absolute;
  inset: 0;
}


.sending-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.sending-icon svg {
  width: 24px;
  height: 24px;
}

h3 {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin: 0;
}

p {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

.sending-dots {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}

.sending-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: dot-pulse 1.4s ease-in-out infinite;
}

.sending-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.sending-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes dot-pulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}
</style>
