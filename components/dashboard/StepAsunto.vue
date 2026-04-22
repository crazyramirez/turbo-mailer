<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'
import { useCampaignSender } from '~/composables/useCampaignSender'

const { subjectInputRef, emailSubject } = useDashboardState()
const { insertVar } = useCampaignSender()
</script>

<template>
  <section class="card" :class="{ 'card-complete': emailSubject.length > 0 }">
    <div class="card-header">
      <div class="step-badge" :class="{ 'step-done': emailSubject.length > 0 }">02</div>
      <div class="card-header-text">
        <h2>Asunto del Email</h2>
        <p class="card-subtitle">Configura el título de tu campaña</p>
      </div>
    </div>
    <div class="input-field-wrap">
      <input
        ref="subjectInputRef"
        v-model="emailSubject"
        type="text"
        placeholder="Asunto del correo..."
        class="input"
      />
      <div class="var-tags-compact">
        <button @click="insertVar('{{Empresa}}')">Empresa</button>
        <button @click="insertVar('{{Nombre}}')">Nombre</button>
      </div>
    </div>
  </section>
</template>
