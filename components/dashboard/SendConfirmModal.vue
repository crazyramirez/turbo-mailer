<script setup lang="ts">
import { useDashboardState } from "~/composables/useDashboardState";
import { useCampaignSender } from "~/composables/useCampaignSender";

const { showSendConfirm, selectedEmails } = useDashboardState();
const { sendEmails } = useCampaignSender();

function cancel() {
  showSendConfirm.value = false;
}

function confirm() {
  showSendConfirm.value = false;
  sendEmails();
}
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="showSendConfirm" class="modal-overlay">
      <div class="modal-window send-confirm-window">
        <div class="modal-content">
          <div class="send-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polyline points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
          <h3>¿Enviar Campaña?</h3>
          <p>
            Se enviará a
            <strong class="count-highlight"
              >{{ selectedEmails.length }} destinatarios</strong
            >.<br />Esta acción no se puede deshacer.
          </p>
        </div>
        <div class="modal-actions">
          <button @click="cancel" class="btn-modal-cancel">Cancelar</button>
          <button @click="confirm" class="btn-send-confirm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polyline points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Enviar ahora
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.send-confirm-window {
  max-width: 480px;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6);
}

.modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.send-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(
    135deg,
    rgba(245, 158, 11, 0.15),
    rgba(239, 68, 68, 0.1)
  );
  border: 1px solid rgba(245, 158, 11, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  color: #f59e0b;
}

.send-icon svg {
  width: 28px;
  height: 28px;
}

h3 {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 10px;
}

p {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.count-highlight {
  color: #f59e0b;
  font-weight: 700;
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
  border: none;
}

.btn-send-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
}

.btn-send-confirm svg {
  width: 16px;
  height: 16px;
}

.btn-send-confirm:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(245, 158, 11, 0.35);
}
</style>
