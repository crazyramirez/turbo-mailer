<script setup lang="ts">
import { LayoutGrid } from "lucide-vue-next";
import { useDashboardState } from "~/composables/useDashboardState";
import { useHtmlImport } from "~/composables/useHtmlImport";

const {
  htmlInputRef,
  htmlFileName,
  htmlBody,
  htmlDragging,
  internalTemplates,
} = useDashboardState();
const { clearHtml, onHtmlChange, onHtmlDrop, openLibrary } = useHtmlImport();
</script>

<template>
  <section class="card" :class="{ 'card-complete': htmlBody }">
    <button
      v-if="htmlBody"
      @click.stop="clearHtml"
      class="btn-card-remove"
      title="Eliminar plantilla"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
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

    <!-- Library shortcut + Drop Zone in a compact row -->
    <div v-if="!htmlBody" class="plantilla-compact-grid">
      <div v-if="internalTemplates.length" class="library-shortcut-card" @click="openLibrary">
        <div class="shortcut-icon">
          <LayoutGrid :size="24" />
        </div>
        <div class="shortcut-text">
          <span>Biblioteca</span>
          <p>Explorar diseños</p>
        </div>
      </div>

      <div
        class="drop-zone drop-zone-ultra-compact"
        :class="{ 'drop-active': htmlDragging }"
        @dragover.prevent="htmlDragging = true"
        @dragleave="htmlDragging = false"
        @drop.prevent="onHtmlDrop"
        @click="htmlInputRef?.click()"
      >
        <input
          ref="htmlInputRef"
          type="file"
          accept=".html"
          class="hidden-input"
          @change="onHtmlChange"
        />
        <div class="drop-content-minimal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span>Subir HTML</span>
        </div>
      </div>
    </div>

    <!-- Loaded Template State -->
    <div v-else class="loaded-template-mini">
      <div class="success-icon-flow icon-html">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          class="check-svg"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="success-meta">
        <span class="success-title">{{ htmlFileName }}</span>
        <div class="success-stats">
          <span class="stat-pill">
            <span class="stat-val">{{ (htmlBody.length / 1024).toFixed(1) }}</span> KB
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
