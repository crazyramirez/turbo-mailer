<script setup lang="ts">
import { LayoutGrid } from 'lucide-vue-next'
import { useDashboardState } from '~/composables/useDashboardState'
import { useHtmlImport } from '~/composables/useHtmlImport'

const { htmlInputRef, htmlFileName, htmlBody, htmlDragging, internalTemplates } = useDashboardState()
const { clearHtml, onHtmlChange, onHtmlDrop, openLibrary } = useHtmlImport()
</script>

<template>
  <section class="card" :class="{ 'card-complete': htmlBody }">
    <button v-if="htmlBody" @click.stop="clearHtml" class="btn-card-remove" title="Eliminar plantilla">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>

    <div class="card-header">
      <div class="step-badge" :class="{ 'step-done': htmlBody }">03</div>
      <div class="card-header-text">
        <h2>Plantilla Creativa</h2>
        <p class="card-subtitle">Diseño HTML de alto impacto</p>
      </div>
    </div>

    <!-- Library shortcut (only if no template loaded) -->
    <div v-if="internalTemplates.length && !htmlBody" class="internal-library-trigger">
      <div class="select-divider"><span>Colección de Diseño</span></div>
      <button @click="openLibrary" class="btn-browse-library">
        <LayoutGrid :size="18" />
        <span>Explorar Biblioteca de Plantillas</span>
      </button>
      <div class="select-divider" style="margin-top: 16px"><span>O sube un diseño externo</span></div>
    </div>

    <div
      class="drop-zone drop-zone-mini"
      :class="{ 'drop-active': htmlDragging, 'drop-loaded': htmlFileName }"
      @dragover.prevent="htmlDragging = true"
      @dragleave="htmlDragging = false"
      @drop.prevent="onHtmlDrop"
      @click="htmlInputRef?.click()"
    >
      <input ref="htmlInputRef" type="file" accept=".html" class="hidden-input" @change="onHtmlChange" />

      <div v-if="!htmlBody" class="drop-content-centered">
        <div class="drop-icon-bg icon-html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="drop-icon">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </div>
        <span class="drop-label">Cargar Plantilla (.html)</span>
      </div>

      <div v-else class="import-success-badge">
        <div class="success-icon-flow icon-html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="check-svg">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="success-meta">
          <span class="success-title">{{ htmlFileName }}</span>
          <div class="success-stats">
            <span class="stat-pill"><span class="stat-val">{{ (htmlBody.length / 1024).toFixed(1) }}</span> KB</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
