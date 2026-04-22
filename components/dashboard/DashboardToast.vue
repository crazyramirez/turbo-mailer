<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const { toast } = useDashboardState()
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="toast.visible" :class="['toast', `toast-${toast.type}`]" role="alert">
      <span class="toast-msg">{{ toast.message }}</span>
    </div>
  </Transition>
</template>
