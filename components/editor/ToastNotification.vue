<script setup lang="ts">
import { CheckCircle2, AlertCircle } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'

const { toast } = useEditorState()
</script>

<template>
  <Transition name="toast-fade">
    <div v-if="toast.visible" :class="['custom-toast', toast.type]">
      <CheckCircle2 v-if="toast.type === 'success'" :size="18" />
      <AlertCircle v-else :size="18" />
      <span>{{ toast.message }}</span>
    </div>
  </Transition>
</template>
