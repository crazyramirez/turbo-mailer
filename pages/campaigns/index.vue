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
} from "lucide-vue-next";

definePageMeta({ layout: "app" });

const { t } = useI18n();
const router = useRouter();
const { showDialog } = useDashboardState();

const campaigns = ref<any[]>([]);
const loading = ref(false);

async function fetchCampaigns() {
  loading.value = true;
  try {
    campaigns.value = await $fetch<any[]>("/api/campaigns");
  } finally {
    loading.value = false;
  }
}

async function deleteCampaign(c: any) {
  const ok = await showDialog({
    type: "confirm",
    title: `¿Eliminar campaña "${c.name}"?`,
  });
  if (!ok) return;
  await $fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
  fetchCampaigns();
}

async function duplicateCampaign(c: any) {
  const full = await $fetch<any>(`/api/campaigns/${c.id}`);
  await $fetch("/api/campaigns", {
    method: "POST",
    body: {
      name: `${full.name} (copia)`,
      subject: full.subject,
      templateName: full.templateName,
      templateHtml: full.templateHtml,
      listId: full.listId,
    },
  });
  fetchCampaigns();
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
  return new Date(typeof d === "number" ? d * 1000 : d).toLocaleDateString(
    "es-ES",
    { day: "2-digit", month: "short", year: "numeric" },
  );
}

onMounted(fetchCampaigns);
</script>

<template>
  <div class="page-layout">
    <main class="page-main">
      <div class="page-header">
        <div>
          <h1>{{ t("campaigns_page.title") }}</h1>
          <p>{{ t("campaigns_page.subtitle") }}</p>
        </div>
        <NuxtLink to="/campaigns/new" class="btn-primary">
          <Plus :size="15" stroke-width="2.5" />
          {{ t("campaigns_page.new_campaign") }}
        </NuxtLink>
      </div>

      <div v-if="loading" class="loading-state">{{ t("common.loading") }}</div>

      <div v-else-if="campaigns.length === 0" class="empty-state">
        <Mail :size="48" class="empty-icon" />
        <p>{{ t("campaigns_page.no_campaigns") }}</p>
        <NuxtLink to="/campaigns/new" class="btn-primary">
          <Plus :size="15" />{{ t("campaigns_page.new_campaign") }}
        </NuxtLink>
      </div>

      <div v-else class="campaigns-grid">
        <div v-for="c in campaigns" :key="c.id" class="campaign-card">
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
              <Eye :size="13" />{{ t("campaigns_page.view") }}
            </NuxtLink>
            <button
              class="btn-action"
              @click="duplicateCampaign(c)"
              :title="t('campaigns_page.duplicate')"
            >
              <Copy :size="13" />
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
  border-color: var(--border-hi);
  transform: translateY(-2px);
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
</style>
