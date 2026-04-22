<script setup lang="ts">
import { useDashboardState } from "~/composables/useDashboardState";
import { useCampaignSender } from "~/composables/useCampaignSender";

const { subjectInputRef, emailSubject } = useDashboardState();
const { insertVar } = useCampaignSender();
</script>

<template>
  <section class="card" :class="{ 'card-complete': emailSubject.length > 0 }">
    <div class="card-header">
      <div class="step-badge" :class="{ 'step-done': emailSubject.length > 0 }">
        02
      </div>
      <div class="card-header-text">
        <h2>Asunto del Email</h2>
        <p class="card-subtitle">Configura el título de tu campaña</p>
      </div>
    </div>
    <div class="subject-input-group">
      <div class="input-relative-wrapper">
        <input
          ref="subjectInputRef"
          v-model="emailSubject"
          type="text"
          placeholder="Escribe el asunto del correo..."
          class="input pr-clear"
        />
        <button
          v-if="emailSubject"
          @click="emailSubject = ''"
          class="btn-clear-input"
          title="Vaciar asunto"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="subject-vars">
        <button @click="insertVar('{{Empresa}}')">Empresa</button>
        <button @click="insertVar('{{Contacto}}')">Contacto</button>
        <button @click="insertVar('{{URL}}')">URL</button>
        <button @click="insertVar('{{Linkedin}}')">LinkedIn</button>
        <button @click="insertVar('{{Instagram}}')">Instagram</button>
        <button @click="insertVar('{{Youtube}}')">YouTube</button>
      </div>
    </div>
  </section>
</template>
