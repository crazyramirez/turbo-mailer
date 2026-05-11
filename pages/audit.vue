<script setup lang="ts">
import {
  ShieldCheck,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-vue-next";

definePageMeta({ layout: "app" });

const { t } = useI18n();

interface AuditRow {
  id: number;
  action: string;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: number | string | null;
}

const rows = ref<AuditRow[]>([]);
const total = ref(0);
const loading = ref(true);
const page = ref(1);
const perPage = 50;
const actionFilter = ref("");
const appliedFilter = ref("");

async function fetch() {
  loading.value = true;
  try {
    const res = await $fetch<{ rows: AuditRow[]; total: number }>(
      "/api/audit-log",
      {
        query: {
          page: page.value,
          limit: perPage,
          action: appliedFilter.value || undefined,
        },
      },
    );
    rows.value = res.rows;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function applyFilter() {
  appliedFilter.value = actionFilter.value.trim();
  page.value = 1;
  fetch();
}

function prevPage() {
  if (page.value > 1) {
    page.value--;
    fetch();
  }
}
function nextPage() {
  if (page.value * perPage < total.value) {
    page.value++;
    fetch();
  }
}

function fmtDate(v: any) {
  if (!v) return "—";
  return new Date(typeof v === "number" ? v * 1000 : v).toLocaleString(
    "es-ES",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    },
  );
}

function actionColor(action: string) {
  if (action.startsWith("login.failed") || action.startsWith("login.blocked"))
    return "red";
  if (action.startsWith("login")) return "green";
  if (action.startsWith("reset")) return "orange";
  if (action.startsWith("campaign.send")) return "purple";
  if (action.startsWith("contacts.import")) return "blue";
  return "gray";
}

const totalPages = computed(() => Math.ceil(total.value / perPage));

onMounted(fetch);
</script>

<template>
  <div class="page-layout" style="user-select: none">
    <main class="page-main">
      <div class="page-header">
        <div class="header-left">
          <ShieldCheck :size="22" class="header-icon" />
          <div>
            <h1>{{ t("nav.audit") }}</h1>
            <p>{{ total.toLocaleString() }} registros</p>
          </div>
        </div>
        <div class="header-actions">
          <div class="filter-row">
            <input
              v-model="actionFilter"
              type="text"
              class="filter-input"
              placeholder="Filtrar por acción..."
              @keydown.enter="applyFilter"
            />
            <button class="btn-apply" @click="applyFilter">Filtrar</button>
          </div>
          <button class="btn-refresh" @click="fetch" :disabled="loading">
            <RefreshCcw :size="14" :class="{ spin: loading }" />
          </button>
        </div>
      </div>

      <div class="audit-panel">
        <div v-if="loading && !rows.length" class="loading-state">
          Cargando...
        </div>
        <div v-else-if="!rows.length" class="empty-state">
          No hay registros de auditoría.
        </div>
        <template v-else>
          <div class="table-container">
            <table class="audit-table">
              <thead>
                <tr>
                  <th class="col-time">Fecha</th>
                  <th class="col-action">Acción</th>
                  <th class="col-ip">IP</th>
                  <th class="col-detail">Detalle</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td class="col-time">
                    <span class="time-text">{{ fmtDate(row.createdAt) }}</span>
                  </td>
                  <td class="col-action">
                    <span class="action-badge" :class="actionColor(row.action)">
                      {{ row.action }}
                    </span>
                  </td>
                  <td class="col-ip">
                    <span class="ip-text">{{ row.ip || "—" }}</span>
                  </td>
                  <td class="col-detail">
                    <span class="detail-text">
                      {{
                        row.detail && Object.keys(row.detail).length
                          ? JSON.stringify(row.detail)
                          : "—"
                      }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="totalPages > 1" class="pagination">
            <button class="page-btn" @click="prevPage" :disabled="page === 1">
              <ChevronLeft :size="14" />
            </button>
            <span class="page-info">{{ page }} / {{ totalPages }}</span>
            <button
              class="page-btn"
              @click="nextPage"
              :disabled="page >= totalPages"
            >
              <ChevronRight :size="14" />
            </button>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page-layout {
  min-height: calc(100vh - 80px);
  color: var(--text);
  display: flex;
  flex-direction: column;
  margin: 0 40px;
}
.page-main {
  flex: 1;
  padding: 40px 0;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.header-icon {
  color: var(--accent-light);
  flex-shrink: 0;
}
h1 {
  font-size: 26px;
  font-weight: 800;
}
p {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.filter-row {
  display: flex;
  gap: 6px;
}
.filter-input {
  background: rgb(0 0 0 / 18%);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 12px;
  padding: 7px 12px;
  outline: none;
  width: 200px;
  transition: border-color 0.18s;
}
.filter-input:focus {
  border-color: var(--accent);
}
.btn-apply {
  font-size: 12px;
  font-weight: 700;
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-light);
  cursor: pointer;
  transition: background 0.18s;
  white-space: nowrap;
}
.btn-apply:hover {
  background: rgba(99, 102, 241, 0.22);
}
.btn-refresh {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-refresh:hover {
  background: rgb(255 255 255 / 6%);
  color: #fff;
}
.btn-refresh:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.spin {
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.audit-panel {
  background: rgb(0 0 0 / 6%);
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 320px);
}

.table-container {
  overflow-y: auto;
  flex: 1;
}

.loading-state,
.empty-state {
  padding: 60px;
  text-align: center;
  color: var(--text-dim);
  font-size: 14px;
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.audit-table thead th {
  padding: 12px 16px;
  text-align: left;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 10;
  backdrop-filter: blur(10px);
}
.audit-table tbody tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.12s;
}
.audit-table tbody tr:last-child {
  border-bottom: none;
}
.audit-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.025);
}
.audit-table td {
  padding: 10px 16px;
  vertical-align: middle;
}

.col-time {
  width: 190px;
}
.col-action {
  width: 200px;
}
.col-ip {
  width: 130px;
}
.col-detail {
}

.time-text {
  color: var(--text-dim);
  font-family: monospace;
  font-size: 11px;
  white-space: nowrap;
}

.action-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
  padding: 3px 9px;
  border-radius: 6px;
  white-space: nowrap;
}
.action-badge.green {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.action-badge.red {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
.action-badge.orange {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.action-badge.purple {
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
}
.action-badge.blue {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
}
.action-badge.gray {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-muted);
}

.ip-text {
  color: var(--text-muted);
  font-family: monospace;
  font-size: 11px;
}

.detail-text {
  color: var(--text-dim);
  font-family: monospace;
  font-size: 10px;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border);
}
.page-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: rgb(255 255 255 / 8%);
  color: #fff;
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.page-info {
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .page-layout {
    margin: 0 20px;
  }
  .col-detail {
    display: none;
  }
}
@media (max-width: 640px) {
  .page-layout {
    margin: 0 16px;
  }
  .filter-input {
    width: 140px;
  }
  h1 {
    font-size: 20px;
  }
  .col-ip {
    display: none;
  }
}
</style>
