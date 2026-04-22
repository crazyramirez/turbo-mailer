<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'
import { useCampaignSender } from '~/composables/useCampaignSender'

const { showResetConfirm } = useDashboardState()
const { performFullReset } = useCampaignSender()
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="showResetConfirm" class="modal-overlay">
      <div class="modal-window">
        <div class="modal-content">
          <div class="modal-icon-warn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3>¿Reiniciar Campaña?</h3>
          <p>Se eliminarán todos los contactos, plantillas y configuraciones actuales. Esta acción no se puede deshacer.</p>
        </div>
        <div class="modal-actions">
          <button @click="showResetConfirm = false" class="btn-modal-cancel">Cancelar</button>
          <button @click="performFullReset" class="btn-modal-confirm">Reiniciar Todo</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
