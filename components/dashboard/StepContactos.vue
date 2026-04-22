<script setup lang="ts">
import { useDashboardState } from '~/composables/useDashboardState'
import { useContactImport } from '~/composables/useContactImport'

const {
  xlsxInputRef,
  xlsxFileName,
  xlsxDragging,
  emails,
  empresaColumn,
  nombreColumn,
  availableColumns,
  selectedColumn,
  rawRows,
} = useDashboardState()

const { clearXlsx, onXlsxChange, onXlsxDrop, remapEmails } = useContactImport()
</script>

<template>
  <section class="card" :class="{ 'card-complete': emails.length > 0 }">
    <button v-if="xlsxFileName" @click.stop="clearXlsx" class="btn-card-remove" title="Eliminar archivo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>

    <div class="card-header">
      <div class="step-badge" :class="{ 'step-done': emails.length > 0 }">01</div>
      <div class="card-header-text">
        <h2>Contactos & Datos</h2>
        <p class="card-subtitle">Importa tu lista de destinatarios</p>
      </div>
    </div>

    <div
      class="drop-zone drop-zone-mini"
      :class="{ 'drop-active': xlsxDragging, 'drop-loaded': xlsxFileName }"
      @dragover.prevent="xlsxDragging = true"
      @dragleave="xlsxDragging = false"
      @drop.prevent="onXlsxDrop"
      @click="xlsxInputRef?.click()"
    >
      <input
        ref="xlsxInputRef"
        type="file"
        accept=".xlsx,.xls,.csv"
        class="hidden-input"
        @change="onXlsxChange"
      />

      <div v-if="!xlsxFileName" class="drop-content-centered">
        <div class="drop-icon-bg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="drop-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        </div>
        <span class="drop-label">Cargar Datos (.xlsx, .xls, .csv)</span>
      </div>

      <div v-else class="import-success-badge">
        <div class="success-icon-flow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="check-svg">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="success-meta">
          <span class="success-title">{{ xlsxFileName }}</span>
          <div class="success-stats">
            <span class="stat-pill"><span class="stat-val">{{ emails.length }}</span> Contactos</span>
            <span v-if="empresaColumn" class="stat-pill var-pill">Empresa</span>
            <span v-if="nombreColumn" class="stat-pill var-pill">Nombre</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="availableColumns.length" class="col-mapping-compact">
      <div class="mapping-item full-width">
        <label>Columna Correo (Principal)</label>
        <select v-model="selectedColumn" class="input" @change="remapEmails">
          <option v-for="c in availableColumns" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="mapping-item">
        <label>Empresa</label>
        <select v-model="empresaColumn" class="input">
          <option value="">(Opcional)</option>
          <option v-for="c in availableColumns" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="mapping-item">
        <label>Nombre</label>
        <select v-model="nombreColumn" class="input">
          <option value="">(Opcional)</option>
          <option v-for="c in availableColumns" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
    </div>
  </section>
</template>
