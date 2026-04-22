<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'
import { useCampaignSender } from '~/composables/useCampaignSender'

const { canSend, isSending, selectedEmails } = useDashboardState()
const { sendEmails } = useCampaignSender()
</script>

<template>
  <div class="send-bar-wrapper" :class="{ 'bar-active': canSend && !isSending }">
    <div class="send-bar-inner">
      <div class="send-bar-info">
        <span class="send-bar-title">Listo para el despegue</span>
        <span class="send-bar-sub">{{ selectedEmails.length }} destinatarios seleccionados</span>
      </div>
      <button class="btn-send-pro" @click="sendEmails" :disabled="isSending">
        <div class="btn-inner">
          <template v-if="isSending">
            <div class="spinner"></div>
            <span>Enviando...</span>
          </template>
          <template v-else>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polyline points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span>Enviar Campaña</span>
          </template>
        </div>
      </button>
    </div>
  </div>
</template>
