<script setup lang="ts">
import AppBackground from '~/components/dashboard/AppBackground.vue'
import DashboardHeader from '~/components/dashboard/DashboardHeader.vue'
import AppToast from '~/components/AppToast.vue'
import AppDialog from '~/components/AppDialog.vue'
</script>

<template>
  <div class="app-wrapper">
    <AppBackground />
    <DashboardHeader />
    <AppToast />
    <AppDialog />
    <slot />
  </div>
</template>
