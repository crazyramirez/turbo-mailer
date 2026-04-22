<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const { stepStatus } = useDashboardState()

const steps = [
  { id: 'recipients', label: 'Contactos' },
  { id: 'subject', label: 'Asunto' },
  { id: 'html', label: 'Plantilla' },
  { id: 'send', label: 'Enviar' },
]
</script>

<template>
  <nav class="stepper">
    <div v-for="(step, i) in steps" :key="step.id" class="stepper-item">
      <div
        class="stepper-node"
        :class="{
          'step-done': stepStatus(i) === 'done',
          'step-active': stepStatus(i) === 'active',
        }"
      >
        <template v-if="stepStatus(i) === 'done'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width: 14px">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </template>
        <span v-else>{{ i + 1 }}</span>
      </div>
      <div v-if="i < steps.length - 1" class="stepper-line"></div>
    </div>
  </nav>
</template>
