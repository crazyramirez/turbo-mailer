<script setup lang="ts">
import { useDashboardState } from "~/composables/useDashboardState";
import { useContactImport } from "~/composables/useContactImport";

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
} = useDashboardState();

const { clearXlsx, onXlsxChange, onXlsxDrop, remapEmails } = useContactImport();
const { contactRows } = useDashboardState();

const showContactList = ref(false);
</script>

<template>
  <section class="card" :class="{ 'card-complete': emails.length > 0 }">
    <button
      v-if="xlsxFileName"
      @click.stop="clearXlsx"
      class="btn-card-remove"
      title="Eliminar archivo"
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
      <div class="step-badge" :class="{ 'step-done': emails.length > 0 }">
        01
      </div>
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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="drop-icon"
          >
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
            />
          </svg>
        </div>
        <span class="drop-label">Cargar Datos (.xlsx, .xls, .csv)</span>
      </div>

      <div v-else class="import-success-badge">
        <div class="success-icon-flow">
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
          <span class="success-title">{{ xlsxFileName }}</span>
          <div class="success-stats">
            <button
              class="stat-pill clickable-pill"
              @click.stop="showContactList = true"
              title="Ver lista de contactos"
            >
              <span class="stat-val">{{ emails.length }}</span> Contactos
            </button>
            <span v-if="empresaColumn" class="stat-pill var-pill">Empresa</span>
            <span v-if="nombreColumn" class="stat-pill var-pill">Nombre</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="availableColumns.length" class="col-mapping-compact">
      <div class="mapping-item full-width">
        <label>Columna Email (Principal)</label>
        <select v-model="selectedColumn" class="input" @change="remapEmails">
          <option v-for="c in availableColumns" :key="c" :value="c">
            {{ c }}
          </option>
        </select>
      </div>
      <div class="mapping-item">
        <label>Empresa</label>
        <select v-model="empresaColumn" class="input">
          <option value="">(Opcional)</option>
          <option v-for="c in availableColumns" :key="c" :value="c">
            {{ c }}
          </option>
        </select>
      </div>
      <div class="mapping-item">
        <label>Nombre</label>
        <select v-model="nombreColumn" class="input">
          <option value="">(Opcional)</option>
          <option v-for="c in availableColumns" :key="c" :value="c">
            {{ c }}
          </option>
        </select>
      </div>
    </div>
  </section>

  <!-- Overlay de Contactos -->
  <Transition name="fade-scale">
    <div
      v-if="showContactList"
      class="modal-overlay glass-modal"
      @click="showContactList = false"
    >
      <div class="modal-window contacts-window" @click.stop>
        <div class="modal-header-pro">
          <div class="header-titles">
            <h2>Contactos Importados</h2>
            <p>
              {{ contactRows.length }} destinatarios encontrados en el archivo
            </p>
          </div>
          <button @click="showContactList = false" class="btn-close-modal">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              style="width: 18px"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="contacts-list-container">
          <div class="contacts-table-header">
            <span class="col-email">Correo Electrónico</span>
            <span v-if="nombreColumn" class="col-extra">Nombre</span>
            <span v-if="empresaColumn" class="col-extra">Empresa</span>
          </div>
          <div class="contacts-list">
            <div
              v-for="(row, idx) in contactRows"
              :key="idx"
              class="contact-row"
            >
              <div class="col-email">
                <span class="row-number">{{ idx + 1 }}</span>
                <span class="email-text">{{ row.email }}</span>
              </div>
              <div v-if="nombreColumn" class="col-extra">
                <span class="extra-val">{{ row.nombre || "—" }}</span>
              </div>
              <div v-if="empresaColumn" class="col-extra">
                <span class="extra-val">{{ row.empresa || "—" }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.clickable-pill {
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid var(--border);
}
.clickable-pill:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.contacts-window {
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 32px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 50px 100px rgba(0, 0, 0, 0.6);
}

.modal-header-pro {
  padding: 24px 32px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-titles h2 {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}
.header-titles p {
  font-size: 13px;
  color: var(--text-muted);
}

.btn-close-modal {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-close-modal:hover {
  background: var(--red);
  color: #fff;
  border-color: var(--red);
}

.contacts-list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 12px 12px;
}

.contacts-table-header {
  display: flex;
  padding: 16px 20px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.contacts-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Custom scrollbar for premium look */
.contacts-list::-webkit-scrollbar {
  width: 6px;
}
.contacts-list::-webkit-scrollbar-track {
  background: transparent;
}
.contacts-list::-webkit-scrollbar-thumb {
  background: var(--border-hi);
  border-radius: 10px;
}

.contact-row {
  display: flex;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  align-items: center;
  transition: background 0.2s;
}
.contact-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.col-email {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.row-number {
  font-size: 10px;
  font-weight: 800;
  color: var(--text-dim);
  width: 20px;
}
.email-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-extra {
  width: 140px;
  padding-left: 20px;
  flex-shrink: 0;
}
.extra-val {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
