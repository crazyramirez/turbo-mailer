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
  agencyColumn,
  puestoColumn,
  linkedinColumn,
  urlColumn,
  youtubeColumn,
  instagramColumn,
  availableColumns,
  selectedColumn,
  rawRows,
} = useDashboardState();

const { clearXlsx, onXlsxChange, onXlsxDrop, remapEmails } = useContactImport();
const { contactRows } = useDashboardState();

const showContactList = ref(false);
const showMappingModal = ref(false);
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
            <button
              v-if="availableColumns.length"
              class="stat-pill clickable-pill mapping-trigger"
              @click.stop="showMappingModal = true"
              title="Configurar variables"
            >
              Mapear Variables
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Overlay de Mapeo -->
  <Transition name="fade-scale">
    <div
      v-if="showMappingModal"
      class="modal-overlay glass-modal"
      @click="showMappingModal = false"
    >
      <div class="modal-window mapping-window" @click.stop>
        <div class="modal-header-pro">
          <div class="header-titles">
            <h2>Asignar Variables</h2>
            <p>Conecta las columnas de tu Excel con las etiquetas del sistema</p>
          </div>
          <button @click="showMappingModal = false" class="btn-close-modal">
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

        <div class="mapping-modal-content">
          <div class="col-mapping-compact">
            <!-- Grupo 1: Vitales -->
            <div class="mapping-group">
              <h3 class="group-title">{{ $t('step_contacts.group_main') }}</h3>
              <div class="mapping-item full-width">
                <label>{{ $t('step_contacts.email_column') }}</label>
                <select
                  v-model="selectedColumn"
                  class="input"
                  @change="remapEmails"
                >
                  <option v-for="c in availableColumns" :key="c" :value="c">
                    {{ c }}
                  </option>
                </select>
              </div>
              <div class="mapping-item">
                <label>{{ $t('contacts_page.name') }}</label>
                <select v-model="nombreColumn" class="input">
                  <option value="">{{ $t('step_contacts.optional') }}</option>
                  <option v-for="c in availableColumns" :key="c" :value="c">
                    {{ c }}
                  </option>
                </select>
              </div>
              <div class="mapping-item">
                <label>{{ $t('step_contacts.label_role') }}</label>
                <select v-model="puestoColumn" class="input">
                  <option value="">{{ $t('step_contacts.optional') }}</option>
                  <option v-for="c in availableColumns" :key="c" :value="c">
                    {{ c }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Grupo 2: Organización -->
            <div class="mapping-group">
              <h3 class="group-title">{{ $t('step_contacts.group_org') }}</h3>
              <div class="mapping-item">
                <label>{{ $t('contacts_page.company') }}</label>
                <select v-model="empresaColumn" class="input">
                  <option value="">{{ $t('step_contacts.optional') }}</option>
                  <option v-for="c in availableColumns" :key="c" :value="c">
                    {{ c }}
                  </option>
                </select>
              </div>
              <div class="mapping-item">
                <label>{{ $t('step_contacts.label_agency') }}</label>
                <select v-model="agencyColumn" class="input">
                  <option value="">{{ $t('step_contacts.optional') }}</option>
                  <option v-for="c in availableColumns" :key="c" :value="c">
                    {{ c }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Grupo 3: Social & Links -->
            <div class="mapping-group">
              <h3 class="group-title">{{ $t('step_contacts.group_social') }}</h3>
              <div class="mapping-grid-3">
                <div class="mapping-item">
                  <label>{{ $t('contacts_page.linkedin') }}</label>
                  <select v-model="linkedinColumn" class="input">
                    <option value="">{{ $t('step_contacts.optional') }}</option>
                    <option v-for="c in availableColumns" :key="c" :value="c">
                      {{ c }}
                    </option>
                  </select>
                </div>
                <div class="mapping-item">
                  <label>{{ $t('contacts_page.url') }}</label>
                  <select v-model="urlColumn" class="input">
                    <option value="">{{ $t('step_contacts.optional') }}</option>
                    <option v-for="c in availableColumns" :key="c" :value="c">
                      {{ c }}
                    </option>
                  </select>
                </div>
                <div class="mapping-item">
                  <label>{{ $t('contacts_page.youtube') }}</label>
                  <select v-model="youtubeColumn" class="input">
                    <option value="">{{ $t('step_contacts.optional') }}</option>
                    <option v-for="c in availableColumns" :key="c" :value="c">
                      {{ c }}
                    </option>
                  </select>
                </div>
                <div class="mapping-item">
                  <label>{{ $t('contacts_page.instagram') }}</label>
                  <select v-model="instagramColumn" class="input">
                    <option value="">{{ $t('step_contacts.optional') }}</option>
                    <option v-for="c in availableColumns" :key="c" :value="c">
                      {{ c }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="mapping-info-box">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <p>
              Cualquier columna no mapeada también estará disponible usando
              <code class="code-pill"> &#123;&#123; Nombre_Columna &#125;&#125; </code> en tu diseño.
            </p>
          </div>

          <div class="mapping-actions">
            <button class="btn-confirm-mapping" @click="showMappingModal = false">
              Guardar Configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>

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
          <div class="contacts-table-wrapper scroll-hide-x">
            <table class="premium-contacts-table">
              <thead>
                <tr>
                  <th class="col-index">#</th>
                  <th
                    v-for="col in availableColumns"
                    :key="col"
                    :class="{
                      'col-primary': col === selectedColumn,
                      'col-mapped':
                        col === nombreColumn || col === empresaColumn || 
                        col === agencyColumn || col === puestoColumn ||
                        col === linkedinColumn || col === urlColumn ||
                        col === youtubeColumn || col === instagramColumn,
                    }"
                  >
                    <div class="th-content">
                      <span>{{ col }}</span>
                      <span
                        v-if="col === selectedColumn"
                        class="col-tag tag-email"
                        >EMAIL</span
                      >
                      <span v-if="col === nombreColumn" class="col-tag tag-var"
                        >{{ $t('contacts_page.col_name') }}</span
                      >
                      <span v-if="col === empresaColumn" class="col-tag tag-var"
                        >{{ $t('contacts_page.col_company') }}</span
                      >
                      <span v-if="col === agencyColumn" class="col-tag tag-var"
                        >{{ $t('step_contacts.col_agency') }}</span
                      >
                      <span v-if="col === puestoColumn" class="col-tag tag-var"
                        >{{ $t('step_contacts.col_role') }}</span
                      >
                      <span v-if="col === linkedinColumn" class="col-tag tag-var"
                        >LINKEDIN</span
                      >
                      <span v-if="col === urlColumn" class="col-tag tag-var"
                        >URL</span
                      >
                      <span v-if="col === youtubeColumn" class="col-tag tag-var"
                        >YOUTUBE</span
                      >
                      <span v-if="col === instagramColumn" class="col-tag tag-var"
                        >INSTAGRAM</span
                      >
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in rawRows" :key="idx">
                  <td class="col-index">{{ idx + 1 }}</td>
                  <td
                    v-for="col in availableColumns"
                    :key="col"
                    :class="{ 'cell-primary': col === selectedColumn }"
                  >
                    {{ row[col] || "—" }}
                  </td>
                </tr>
              </tbody>
            </table>
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

.mapping-trigger {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-light);
  border: 1px solid rgba(99, 102, 241, 0.2);
}
.mapping-trigger:hover {
  background: var(--accent) !important;
  color: #fff !important;
}

.mapping-window {
  max-width: 600px;
  width: 90%;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 32px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 50px 100px rgba(0, 0, 0, 0.6);
}

.mapping-modal-content {
  padding: 0 32px 32px;
  max-height: 70vh;
  overflow-y: auto;
}

.mapping-group {
  margin-bottom: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 20px;
  border: 1px solid var(--border);
}

.group-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--accent-light);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--accent), transparent);
  opacity: 0.2;
}

.mapping-grid-3 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.mapping-info-box {
  margin-top: 24px;
  padding: 16px;
  background: rgba(99, 102, 241, 0.05);
  border-radius: 16px;
  border: 1px solid rgba(99, 102, 241, 0.1);
  display: flex;
  gap: 12px;
  align-items: center;
}

.mapping-info-box svg {
  width: 20px;
  height: 20px;
  color: var(--accent-light);
  flex-shrink: 0;
}

.mapping-info-box p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.5;
}

.code-pill {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #fff;
  font-size: 12px;
}

.mapping-actions {
  margin-top: 32px;
}

.btn-confirm-mapping {
  width: 100%;
  padding: 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.2);
}

.btn-confirm-mapping:hover {
  transform: translateY(-2px);
  box-shadow: 0 15px 30px rgba(99, 102, 241, 0.3);
  filter: brightness(1.1);
}

.contacts-window {
  max-width: 1600px;
  width: 95%;
  max-height: 85vh;
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
  padding: 0 0 24px 0;
}

.contacts-table-wrapper {
  flex: 1;
  overflow: auto;
  padding: 0 32px;
}

/* Custom scrollbar for premium look */
.contacts-table-wrapper::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.contacts-table-wrapper::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
}
.contacts-table-wrapper::-webkit-scrollbar-thumb {
  background: var(--border-hi);
  border-radius: 10px;
}

.premium-contacts-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 4px;
}

.premium-contacts-table th {
  position: sticky;
  top: 0;
  background: #090b14;
  z-index: 10;
  text-align: left;
  padding: 16px 20px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.th-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.col-tag {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
}
.tag-email {
  background: var(--accent);
  color: #fff;
}
.tag-var {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
}

.premium-contacts-table td {
  padding: 12px 20px;
  font-size: 13px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.02);
  white-space: nowrap;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.premium-contacts-table tr td:first-child {
  border-radius: 12px 0 0 12px;
}
.premium-contacts-table tr td:last-child {
  border-radius: 0 12px 12px 0;
}

.premium-contacts-table tr:hover td {
  background: rgba(255, 255, 255, 0.05);
}

.col-index {
  width: 50px;
  text-align: center !important;
  color: var(--text-dim) !important;
  font-weight: 800;
}

.col-primary {
  color: var(--accent-light) !important;
}
.cell-primary {
  color: var(--accent-light) !important;
  font-weight: 600;
}
.col-mapped {
  color: #fff !important;
}
</style>
