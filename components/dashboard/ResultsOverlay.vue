<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'

const { sendResults, isSending, sentCount, failedCount } = useDashboardState()
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="sendResults.length && !isSending" class="results-overlay">
      <div class="results-window">
        <div class="results-header-pro">
          <h2>Resultados</h2>
          <button class="close-results" @click="sendResults = []">&times;</button>
        </div>

        <div class="results-stats-pro">
          <div class="stat-card stat-success">
            <span class="stat-num">{{ sentCount }}</span>
            <span class="stat-label">Enviados</span>
          </div>
          <div class="stat-card stat-error">
            <span class="stat-num">{{ failedCount }}</span>
            <span class="stat-label">Fallidos</span>
          </div>
        </div>

        <div class="results-list-pro">
          <div
            v-for="r in sendResults"
            :key="r.email"
            class="result-row-pro"
            :class="r.status"
          >
            <div class="r-dot"></div>
            <span class="r-email">{{ r.email }}</span>
            <span class="r-status">{{ r.status }}</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
