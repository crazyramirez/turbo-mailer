<script setup lang="ts">
import {
  Mail,
  Plus,
  BarChart2,
  Users,
  Eye,
  Trash2,
  Copy,
  Send,
  Clock,
  PauseCircle,
  CheckCircle,
  FileEdit,
  Loader2,
} from "lucide-vue-next";

definePageMeta({ layout: "app" });

const { t } = useI18n();
const router = useRouter();
const { showDialog } = useDashboardState();
const { form, step, resetWizard } = useCampaignWizardState();

const hasDraft = computed(() => {
  return (
    form.value.name.trim() !== "" ||
    form.value.subject.trim() !== "" ||
    form.value.templateHtml !== ""
  );
});

const campaigns = ref<any[]>([]);
const loading = ref(false);

async function fetchCampaigns(showLoading = true) {
  if (showLoading) loading.value = true;
  try {
    campaigns.value = await $fetch<any[]>("/api/campaigns");
  } finally {
    if (showLoading) loading.value = false;
  }
}

async function deleteCampaign(c: any) {
  const ok = await showDialog({
    type: "confirm",
    title: `¿Eliminar campaña "${c.name}"?`,
  });
  if (!ok) return;
  try {
    await $fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    // Actualizar la lista localmente de inmediato para mejorar la respuesta visual
    campaigns.value = campaigns.value.filter((item) => item.id !== c.id);
    showToast("Campaña eliminada", "success");
    fetchCampaigns(false);
  } catch (e: any) {
    showToast("Error al eliminar la campaña", "error");
  }
}

const duplicatingId = ref<number | null>(null);

async function duplicateCampaign(c: any) {
  duplicatingId.value = c.id;
  try {
    const full = await $fetch<any>(`/api/campaigns/${c.id}`);
    const res = await $fetch<any>("/api/campaigns", {
      method: "POST",
      body: {
        name: `${full.name} (copia)`,
        subject: full.subject,
        templateName: full.templateName,
        templateHtml: full.templateHtml,
        listId: full.listId,
      },
    });

    // Añadir a la lista manualmente con el nombre de la lista del original para evitar el hueco visual
    campaigns.value.unshift({ ...res, listName: c.listName });
    showToast("Campaña duplicada", "success");

    // Sincronizar la lista completa (para traer datos finales del servidor)
    await fetchCampaigns(false);
  } finally {
    duplicatingId.value = null;
  }
}

function openRate(c: any) {
  if (!c.sentCount) return "—";
  return `${Math.round((c.openCount / c.sentCount) * 100)}%`;
}
function clickRate(c: any) {
  if (!c.sentCount) return "—";
  return `${Math.round((c.clickCount / c.sentCount) * 100)}%`;
}

function statusIcon(s: string) {
  if (s === "draft") return FileEdit;
  if (s === "scheduled") return Clock;
  if (s === "sending") return Send;
  if (s === "sent") return CheckCircle;
  if (s === "paused") return PauseCircle;
  return FileEdit;
}
function statusLabel(s: string) {
  return t(`campaigns_page.status_${s}`);
}
function statusClass(s: string) {
  if (s === "sent") return "badge-sent";
  if (s === "sending") return "badge-sending";
  if (s === "scheduled") return "badge-scheduled";
  if (s === "paused") return "badge-paused";
  return "badge-draft";
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(typeof d === "number" ? d * 1000 : d).toLocaleString(
    "es-ES",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

onMounted(async () => {
  await fetchCampaigns();
  if (campaigns.value.some((c) => c.status === "sending")) {
    startPolling();
  }
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await fetchCampaigns(false);
    const hasSending = campaigns.value.some((c) => c.status === "sending");
    if (!hasSending) stopPolling();
  }, 5000);
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onUnmounted(stopPolling);
</script>

<template>
  <div class="page-layout">
    <main class="page-main">
      <div class="page-header">
        <div>
          <h1>{{ t("campaigns_page.title") }}</h1>
          <p>{{ t("campaigns_page.subtitle") }}</p>
        </div>
        <div class="header-actions">
          <NuxtLink to="/campaigns/new" class="btn-primary">
            <Plus :size="15" stroke-width="2.5" />
            <span>{{ t("campaigns_page.new_campaign") }}</span>
          </NuxtLink>
        </div>
      </div>

      <div v-if="loading" class="loading-state">{{ t("common.loading") }}</div>

      <div v-else-if="campaigns.length === 0 && !hasDraft" class="empty-state">
        <Mail :size="48" class="empty-icon" />
        <p>{{ t("campaigns_page.no_campaigns") }}</p>
        <NuxtLink to="/campaigns/new" class="btn-primary">
          <Plus :size="15" />{{ t("campaigns_page.new_campaign") }}
        </NuxtLink>
      </div>

      <TransitionGroup
        name="premium-list"
        tag="div"
        v-else
        class="campaigns-grid"
      >
        <!-- Virtual Draft Card -->
        <div
          v-if="hasDraft"
          key="wizard-draft"
          class="campaign-card draft-wizard-card"
        >
          <div class="card-top">
            <span class="badge badge-draft-wizard">
              <FileEdit :size="11" />
              Borrador actual
            </span>
            <span class="card-date">Paso {{ step }} de 4</span>
          </div>
          <h3 class="card-name">{{ form.name || "Nueva Campaña" }}</h3>
          <p class="card-subject">{{ form.subject || "Sin asunto aún..." }}</p>

          <div class="draft-wizard-progress">
            <div class="progress-bar-bg">
              <div
                class="progress-bar-fill"
                :style="{ width: (step / 4) * 100 + '%' }"
              ></div>
            </div>
          </div>

          <div class="card-actions">
            <NuxtLink to="/campaigns/new" class="btn-action-resume">
              <Send :size="13" /> Continuar edición
            </NuxtLink>
            <button
              class="btn-action danger"
              @click="resetWizard"
              title="Descartar borrador"
            >
              <Trash2 :size="13" />
            </button>
          </div>
        </div>

        <div
          v-for="c in campaigns"
          :key="c.id"
          class="campaign-card"
          :class="{ 'is-duplicating': duplicatingId === c.id }"
        >
          <!-- Status badge -->
          <div class="card-top">
            <span class="badge" :class="statusClass(c.status)">
              <component :is="statusIcon(c.status)" :size="11" />
              {{ statusLabel(c.status) }}
            </span>
            <span class="card-date">{{
              fmtDate(c.finishedAt || c.createdAt)
            }}</span>
          </div>

          <!-- Name & subject -->
          <h3 class="card-name">{{ c.name }}</h3>
          <p class="card-subject">{{ c.subject }}</p>
          <p v-if="c.listName" class="card-list">
            <Users :size="12" />{{ c.listName }}
          </p>

          <!-- Stats -->
          <div class="card-stats">
            <div class="stat">
              <span class="stat-val">{{ c.sentCount ?? 0 }}</span>
              <span class="stat-label">{{ t("campaigns_page.col_sent") }}</span>
            </div>
            <div class="stat">
              <span class="stat-val accent">{{ openRate(c) }}</span>
              <span class="stat-label">{{
                t("campaigns_page.open_rate")
              }}</span>
            </div>
            <div class="stat">
              <span class="stat-val">{{ clickRate(c) }}</span>
              <span class="stat-label">{{
                t("campaigns_page.click_rate")
              }}</span>
            </div>
            <div class="stat">
              <span class="stat-val red">{{ c.failCount ?? 0 }}</span>
              <span class="stat-label">{{ t("campaigns_page.failed") }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="card-actions">
            <NuxtLink :to="`/campaigns/${c.id}`" class="btn-action">
              <Eye :size="13" /><span>{{ t("campaigns_page.view") }}</span>
            </NuxtLink>
            <button
              class="btn-action"
              @click="duplicateCampaign(c)"
              :title="t('campaigns_page.duplicate')"
              :disabled="duplicatingId === c.id"
            >
              <Loader2 v-if="duplicatingId === c.id" :size="13" class="spin" />
              <Copy v-else :size="13" />
            </button>
            <button
              class="btn-action danger"
              @click="deleteCampaign(c)"
              :title="t('campaigns_page.delete')"
            >
              <Trash2 :size="13" />
            </button>
          </div>
        </div>
      </TransitionGroup>
    </main>
  </div>
</template>

<style scoped>
.draft-wizard-card {
  background: linear-gradient(
    145deg,
    rgba(99, 102, 241, 0.12),
    rgba(15, 17, 35, 0.4)
  ) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  position: relative;
}
.badge-draft-wizard {
  background: rgba(99, 102, 241, 0.2);
  color: var(--accent-light);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.draft-wizard-progress {
  margin: 10px 0;
}
.progress-bar-bg {
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 10px;
  box-shadow: 0 0 12px var(--accent);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-action-resume {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  transition: all 0.2s;
}
.btn-action-resume:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.page-layout {
  min-height: calc(100vh - 80px);
  color: var(--text);
  display: flex;
  flex-direction: column;
  position: relative;
  margin: 0 40px;
}

.page-main {
  flex: 1;
  padding: 40px 0px;
  z-index: 1;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 36px;
}
.page-header h1 {
  font-size: 28px;
  font-weight: 800;
}
.page-header p {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 4px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--text-dim);
}
.empty-icon {
  opacity: 0.7;
}
.empty-state p {
  font-size: 15px;
  color: var(--text-muted);
}

.campaigns-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.campaign-card {
  background: rgb(0 0 0 / 7%);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition:
    border-color 0.2s,
    transform 0.2s;
}
.campaign-card:hover {
  transform: translateY(-2px);
  background: rgb(255, 255, 255, 0.02);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-date {
  font-size: 11px;
  color: var(--text-dim);
}
.card-name {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  margin: 4px 0 0;
}
.card-subject {
  font-size: 13px;
  color: var(--text-muted);
}
.card-list {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-dim);
}

.card-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 14px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.stat-val {
  font-size: 16px;
  font-weight: 800;
}
.stat-val.accent {
  color: var(--accent-light);
}
.stat-val.red {
  color: #ef4444;
}
.stat-label {
  font-size: 10px;
  color: var(--text-dim);
  text-align: center;
}

.card-actions {
  display: flex;
  gap: 8px;
}
.btn-action {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}
.btn-action:hover {
  background: rgb(0 0 0 / 7%);
  color: var(--text);
}
.btn-action.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
}

/* Badge */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.badge-draft {
  background: rgb(0 0 0 / 6%);
  color: var(--text-muted);
}
.badge-sent {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.badge-sending {
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-light);
}
.badge-scheduled {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.badge-paused {
  background: rgba(156, 163, 175, 0.12);
  color: #9ca3af;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}
.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* ── Responsive ──────────────────────────────────────────── */

@media (max-width: 900px) {
  .page-layout {
    margin: 0 20px;
  }
  .page-main {
    padding: 32px 0;
  }
  .page-header h1 {
    font-size: 24px;
  }
  .campaigns-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 640px) {
  .page-layout {
    margin: 0 16px;
  }
  .page-main {
    padding: 24px 0;
  }
  .page-header {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }
  .page-header h1 {
    font-size: 20px;
  }
  .header-actions {
    flex-shrink: 0;
  }
  .btn-primary {
    min-height: 44px;
    min-width: 44px;
    width: auto;
    padding: 0 10px;
    font-size: 12px;
    justify-content: center;
  }
  .campaigns-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .campaign-card {
    padding: 18px;
    border-radius: 16px;
  }
  .card-stats {
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    padding: 12px 0;
  }
  .card-actions {
    flex-wrap: wrap;
    gap: 6px;
  }
  .btn-action {
    flex: 1;
    justify-content: center;
    min-height: 40px;
  }
}

@media (max-width: 480px) {
  .page-layout {
    margin: 0 12px;
  }
  .page-header h1 {
    font-size: 18px;
  }
  .btn-primary span,
  .btn-action span {
    display: none;
  }
  .btn-primary {
    padding: 0 10px;
  }
  .campaign-card {
    padding: 16px;
  }
  .card-name {
    font-size: 15px;
  }
  .stat-val {
    font-size: 14px;
  }
}

/* Premium List Transitions & Animations */
.premium-list-move {
  transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}

.premium-list-enter-active {
  transition: all 0.9s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.premium-list-leave-active {
  transition: all 0.5s cubic-bezier(0.32, 0, 0.67, 0);
  position: absolute;
  width: 100%;
  max-width: 350px;
}

.premium-list-enter-from {
  opacity: 0;
  transform: scale(0.5) translateY(-100px) rotate(-8deg);
  filter: blur(12px) brightness(3) saturate(1.5);
}

.premium-list-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
  filter: blur(4px);
}

.premium-list-leave-active {
  position: absolute;
  z-index: 0;
}

.campaign-card.is-duplicating {
  animation: premium-pulse 1.5s infinite;
  border-color: var(--accent);
}

@keyframes premium-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(99, 102, 241, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
