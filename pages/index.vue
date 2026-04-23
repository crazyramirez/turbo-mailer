<script setup lang="ts">
import {
  Users,
  Mail,
  Eye,
  MousePointerClick,
  Plus,
  Send,
  Copy,
  Pencil,
  FileEdit,
  CheckCircle,
  Clock,
  PauseCircle,
  ArrowRight,
  Trash2,
} from "lucide-vue-next";
import CampaignPreview from "~/components/campaigns/CampaignPreview.vue";
import ResetModal from "~/components/dashboard/ResetModal.vue";
import WelcomeModal from "~/components/dashboard/WelcomeModal.vue";

definePageMeta({ layout: "app" });

const { t, locale } = useI18n();
const { showToast } = useDashboardState();

// ── Interfaces ──────────────────────────────────────────────────
interface RecentOpen {
  id: number;
  createdAt: string | number;
  ip: string;
  userAgent: string;
  campaignId: number;
  campaignName: string;
  contactEmail: string;
  contactName: string;
}
interface AnalyticsResponse {
  totalContacts: number;
  totalCampaigns: number;
  avgOpenRate: number;
  avgClickRate: number;
  recentOpens: RecentOpen[];
  topCampaigns: any[];
}
interface Campaign {
  id: number;
  name: string;
  subject: string;
  templateName: string | null;
  templateHtml: string | null;
  listId: number | null;
  listName: string | null;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  totalRecipients: number | null;
  sentCount: number | null;
  openCount: number | null;
  clickCount: number | null;
  failCount: number | null;
}

// ── State ────────────────────────────────────────────────────────
const analyticsData = ref<AnalyticsResponse | null>(null);
const campaigns = ref<Campaign[]>([]);
const analyticsLoading = ref(true);
const campaignsLoading = ref(true);
const selectedCampaign = ref<Campaign | null>(null);
const showResetModal = ref(false);
const welcomeDismissed = ref(
  typeof localStorage !== "undefined" &&
    !!localStorage.getItem("turbomailer_welcome_seen"),
);
let refreshTimer: ReturnType<typeof setInterval>;

const showWelcome = computed(
  () =>
    !analyticsLoading.value &&
    !campaignsLoading.value &&
    !welcomeDismissed.value &&
    (analyticsData.value?.totalContacts ?? 0) === 0 &&
    campaigns.value.length === 0,
);

function dismissWelcome() {
  localStorage.setItem("turbomailer_welcome_seen", "1");
  welcomeDismissed.value = true;
}

// ── Computed ─────────────────────────────────────────────────────
const recentCampaigns = computed(() => campaigns.value.slice(0, 12));
const activityItems = computed(
  () => analyticsData.value?.recentOpens.slice(0, 6) ?? [],
);
const formattedDate = computed(() =>
  new Date().toLocaleDateString(locale.value === "es" ? "es-ES" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }),
);

// ── Fetch ────────────────────────────────────────────────────────
async function fetchAll() {
  analyticsLoading.value = true;
  campaignsLoading.value = true;
  const [ana, cams] = await Promise.all([
    $fetch<AnalyticsResponse>("/api/analytics").catch(() => null),
    $fetch<Campaign[]>("/api/campaigns").catch(() => []),
  ]);
  analyticsData.value = ana;
  campaigns.value = cams ?? [];
  if (selectedCampaign.value) {
    const refreshed = campaigns.value.find(
      (c) => c.id === selectedCampaign.value!.id,
    );
    if (refreshed) selectedCampaign.value = refreshed;
  } else if (campaigns.value.length > 0) {
    selectedCampaign.value = campaigns.value[0];
  }
  analyticsLoading.value = false;
  campaignsLoading.value = false;
}

onMounted(() => {
  fetchAll();
  refreshTimer = setInterval(fetchAll, 60_000);
});
onUnmounted(() => clearInterval(refreshTimer));

// ── Helpers ──────────────────────────────────────────────────────
function openRatePct(c: Campaign): string {
  if (!c.sentCount) return "—";
  return `${Math.round(((c.openCount ?? 0) / c.sentCount) * 100)}%`;
}
function clickRatePct(c: Campaign): string {
  if (!c.sentCount) return "—";
  return `${Math.round(((c.clickCount ?? 0) / c.sentCount) * 100)}%`;
}
function fmtDate(d: any): string {
  if (!d) return "—";
  return new Date(typeof d === "number" ? d * 1000 : d).toLocaleDateString(
    "es-ES",
    { day: "2-digit", month: "short", year: "numeric" },
  );
}
function timeAgo(d: string | number | null): string {
  if (!d) return "—";
  const date = new Date(typeof d === "number" ? d * 1000 : d);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("dashboard.just_now");
  if (mins < 60) return t("dashboard.minutes_ago", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("dashboard.hours_ago", { n: hrs });
  return fmtDate(d);
}
function initials(name: string | null, email: string | null): string {
  if (name)
    return name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  if (email) return email[0].toUpperCase();
  return "?";
}
function avatarColor(str: string): string {
  const code = str.charCodeAt(0) || 0;
  return `hsl(${(code * 37) % 360}, 60%, 55%)`;
}
function statusIcon(s: string) {
  if (s === "draft") return FileEdit;
  if (s === "scheduled") return Clock;
  if (s === "sending") return Send;
  if (s === "sent") return CheckCircle;
  if (s === "paused") return PauseCircle;
  return FileEdit;
}
function statusLabel(s: string): string {
  return t(`campaigns_page.status_${s}`);
}
function statusClass(s: string): string {
  if (s === "sent") return "badge-sent";
  if (s === "sending") return "badge-sending";
  if (s === "scheduled") return "badge-scheduled";
  if (s === "paused") return "badge-paused";
  return "badge-draft";
}

// ── Actions ──────────────────────────────────────────────────────
function selectCampaign(c: Campaign) {
  if (selectedCampaign.value?.id === c.id) {
    // selectedCampaign.value = null;
    return;
  }
  selectedCampaign.value = c;
}
function editTemplate() {
  if (!selectedCampaign.value) return;
  if (selectedCampaign.value.templateName) {
    localStorage.setItem(
      "last_edited_template",
      selectedCampaign.value.templateName,
    );
  }
  navigateTo("/editor");
}
async function duplicateCampaign() {
  if (!selectedCampaign.value) return;
  const c = selectedCampaign.value;
  try {
    await $fetch("/api/campaigns", {
      method: "POST",
      body: {
        name: `${c.name} (copia)`,
        subject: c.subject,
        templateName: c.templateName,
        templateHtml: c.templateHtml,
        listId: c.listId,
      },
    });
    showToast(t("dashboard.duplicated_ok"), "success");
    await fetchAll();
  } catch {
    showToast(t("dashboard.duplicate_error"), "error");
  }
}
</script>

<template>
  <div class="page-layout">
    <main class="page-main">
      <!-- Hero Header -->
      <div class="dash-header">
        <div class="dash-header-left">
          <h1>{{ t("dashboard.welcome") }}</h1>
          <p>{{ formattedDate }}</p>
        </div>
        <div class="dash-header-actions">
          <NuxtLink to="/campaigns/new" class="btn-primary">
            <Plus :size="15" stroke-width="2.5" />
            {{ t("dashboard.new_campaign") }}
          </NuxtLink>
          <NuxtLink to="/campaigns" class="btn-secondary">
            <Mail :size="14" />
            {{ t("dashboard.all_campaigns") }}
            <ArrowRight :size="13" />
          </NuxtLink>
          <button class="btn-reset" @click="showResetModal = true">
            <Trash2 :size="14" />
            {{ t("dashboard.reset_btn") }}
          </button>
        </div>
      </div>

      <ResetModal
        v-if="showResetModal"
        @close="showResetModal = false"
        @done="fetchAll"
      />
      <WelcomeModal
        v-if="showWelcome"
        @close="dismissWelcome"
        @done="dismissWelcome"
      />

      <!-- KPI Row -->
      <div class="kpi-grid">
        <template v-if="analyticsLoading">
          <div v-for="i in 4" :key="i" class="kpi-card">
            <div class="skeleton skeleton-icon" />
            <div style="flex: 1">
              <div class="skeleton skeleton-val" />
              <div class="skeleton skeleton-lbl" />
            </div>
          </div>
        </template>
        <template v-else>
          <div class="kpi-card">
            <div class="kpi-icon blue"><Users :size="22" /></div>
            <div>
              <div class="kpi-val">
                {{ analyticsData?.totalContacts?.toLocaleString() ?? "—" }}
              </div>
              <div class="kpi-lbl">
                {{ t("analytics_page.total_contacts") }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon purple"><Mail :size="22" /></div>
            <div>
              <div class="kpi-val">
                {{ analyticsData?.totalCampaigns ?? "—" }}
              </div>
              <div class="kpi-lbl">
                {{ t("analytics_page.total_campaigns") }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon green"><Eye :size="22" /></div>
            <div>
              <div class="kpi-val">
                {{ analyticsData ? `${analyticsData.avgOpenRate}%` : "—" }}
              </div>
              <div class="kpi-lbl">
                {{ t("analytics_page.avg_open_rate") }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon orange"><MousePointerClick :size="22" /></div>
            <div>
              <div class="kpi-val">
                {{ analyticsData ? `${analyticsData.avgClickRate}%` : "—" }}
              </div>
              <div class="kpi-lbl">
                {{ t("analytics_page.avg_click_rate") }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Main 2-col grid -->
      <div class="dash-main-grid">
        <!-- Campaign List Panel -->
        <div class="panel campaign-list-panel">
          <div class="panel-header">
            <h2>{{ t("dashboard.recent_campaigns") }}</h2>
            <span v-if="recentCampaigns.length > 0" class="count-badge">
              {{ recentCampaigns.length }}
            </span>
          </div>

          <div v-if="campaignsLoading" class="loading-list">
            <div v-for="i in 4" :key="i" class="skeleton-row">
              <div
                class="skeleton"
                style="width: 60px; height: 18px; border-radius: 20px"
              />
              <div
                class="skeleton"
                style="width: 70%; height: 15px; border-radius: 6px"
              />
              <div
                class="skeleton"
                style="width: 50%; height: 12px; border-radius: 6px"
              />
            </div>
          </div>

          <div v-else-if="recentCampaigns.length === 0" class="empty-state">
            <Mail :size="40" class="empty-icon" />
            <p>{{ t("campaigns_page.no_campaigns") }}</p>
            <NuxtLink to="/campaigns/new" class="btn-primary">
              <Plus :size="14" />{{ t("dashboard.new_campaign") }}
            </NuxtLink>
          </div>

          <div v-else class="campaign-scroll-area">
            <div
              v-for="c in recentCampaigns"
              :key="c.id"
              class="campaign-item"
              :class="{ selected: selectedCampaign?.id === c.id }"
              @click="selectCampaign(c)"
            >
              <div class="ci-left">
                <span class="badge" :class="statusClass(c.status)">
                  <component :is="statusIcon(c.status)" :size="10" />
                  {{ statusLabel(c.status) }}
                </span>
                <h3 class="ci-name">{{ c.name }}</h3>
                <p class="ci-subject">{{ c.subject }}</p>
                <p v-if="c.listName" class="ci-list">
                  <Users :size="10" />{{ c.listName }}
                </p>
              </div>
              <div class="ci-right">
                <div class="ci-stats">
                  <div class="ci-stat">
                    <Send :size="10" /><span>{{ c.sentCount ?? 0 }}</span>
                  </div>
                  <div class="ci-stat green">
                    <Eye :size="10" /><span>{{ openRatePct(c) }}</span>
                  </div>
                  <div class="ci-stat blue">
                    <MousePointerClick :size="10" /><span>{{
                      clickRatePct(c)
                    }}</span>
                  </div>
                </div>
                <span class="ci-date">{{
                  fmtDate(c.finishedAt || c.createdAt)
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Preview Panel -->
        <div class="panel preview-panel">
          <Transition name="preview-swap" mode="out-in">
            <div v-if="!selectedCampaign" key="empty" class="preview-empty">
              <div class="preview-empty-icon">
                <Mail :size="42" stroke-width="1.2" />
              </div>
              <p>{{ t("dashboard.preview_empty_title") }}</p>
              <span>{{ t("dashboard.preview_empty_sub") }}</span>
            </div>

            <div v-else key="content" class="preview-content">
              <div class="preview-header">
                <span
                  class="badge"
                  :class="statusClass(selectedCampaign.status)"
                >
                  <component
                    :is="statusIcon(selectedCampaign.status)"
                    :size="10"
                  />
                  {{ statusLabel(selectedCampaign.status) }}
                </span>
                <h3 class="preview-name">{{ selectedCampaign.name }}</h3>
              </div>

              <div
                v-if="selectedCampaign.templateHtml"
                class="preview-frame-wrap"
              >
                <CampaignPreview
                  :html="selectedCampaign.templateHtml"
                  :subject="selectedCampaign.subject"
                />
              </div>
              <div v-else class="preview-no-template">
                <FileEdit :size="32" stroke-width="1.2" />
                <span>{{ t("dashboard.no_template_yet") }}</span>
              </div>

              <div class="preview-actions">
                <button
                  v-if="selectedCampaign.templateHtml"
                  class="btn-action"
                  @click="editTemplate"
                >
                  <Pencil :size="13" />{{ t("dashboard.edit_template") }}
                </button>
                <NuxtLink
                  :to="`/campaigns/${selectedCampaign.id}`"
                  class="btn-action"
                >
                  <Eye :size="13" />{{ t("dashboard.view_details") }}
                </NuxtLink>
                <button class="btn-action" @click="duplicateCampaign">
                  <Copy :size="13" />{{ t("dashboard.duplicate") }}
                </button>
              </div>

              <div
                v-if="selectedCampaign.status !== 'draft'"
                class="preview-stats"
              >
                <div class="ps-item">
                  <span class="ps-val">{{
                    selectedCampaign.sentCount ?? 0
                  }}</span>
                  <span class="ps-lbl">{{ t("campaigns_page.col_sent") }}</span>
                </div>
                <div class="ps-item">
                  <span class="ps-val green">{{
                    openRatePct(selectedCampaign)
                  }}</span>
                  <span class="ps-lbl">{{
                    t("campaigns_page.open_rate")
                  }}</span>
                </div>
                <div class="ps-item">
                  <span class="ps-val blue">{{
                    clickRatePct(selectedCampaign)
                  }}</span>
                  <span class="ps-lbl">{{
                    t("campaigns_page.click_rate")
                  }}</span>
                </div>
                <div class="ps-item">
                  <span class="ps-val red">{{
                    selectedCampaign.failCount ?? 0
                  }}</span>
                  <span class="ps-lbl">{{ t("campaigns_page.failed") }}</span>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Activity Strip -->
      <div class="panel activity-strip">
        <div class="panel-header">
          <h2>{{ t("dashboard.recent_activity") }}</h2>
        </div>
        <div v-if="activityItems.length === 0" class="empty-note">
          {{ t("dashboard.no_activity") }}
        </div>
        <div v-else class="activity-grid">
          <div v-for="ev in activityItems" :key="ev.id" class="activity-card">
            <div
              class="ac-avatar"
              :style="{
                background: avatarColor(
                  initials(ev.contactName, ev.contactEmail),
                ),
              }"
            >
              {{ initials(ev.contactName, ev.contactEmail) }}
            </div>
            <div class="ac-body">
              <span class="ac-name">{{
                ev.contactName || ev.contactEmail || ev.ip
              }}</span>
              <span v-if="ev.contactEmail && ev.contactName" class="ac-email">{{
                ev.contactEmail
              }}</span>
              <span class="ac-campaign">{{ ev.campaignName }}</span>
            </div>
            <span class="ac-time">{{ timeAgo(ev.createdAt) }}</span>
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
  padding: 40px 0;
  z-index: 1;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Hero Header ─────────────────────────────────────────── */
.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.dash-header-left h1 {
  font-size: 28px;
  font-weight: 800;
}
.dash-header-left p {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 4px;
  text-transform: capitalize;
}
.dash-header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
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
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}
.btn-secondary:hover {
  background: rgb(0 0 0 / 6%);
  color: var(--text);
}
.btn-reset {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  background: transparent;
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}
.btn-reset:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.6);
}

/* ── KPI ─────────────────────────────────────────────────── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.kpi-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px;
  background: rgb(0 0 0 / 7%);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 18px;
}
.kpi-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kpi-icon.blue {
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
}
.kpi-icon.purple {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-light);
}
.kpi-icon.green {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
.kpi-icon.orange {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}
.kpi-val {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
}
.kpi-lbl {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 3px;
}

/* ── Main grid ───────────────────────────────────────────── */
.dash-main-grid {
  display: grid;
  grid-template-columns: 4fr 5fr;
  gap: 20px;
  align-items: start;
}

/* ── Panel base ──────────────────────────────────────────── */
.panel {
  background: rgb(0 0 0 / 6%);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 700px;
}

@media (max-width: 1400px) {
  .panel {
    height: auto;
  }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-header h2 {
  font-size: 15px;
  font-weight: 800;
  flex: 1;
  margin: 0;
}
.count-badge {
  padding: 2px 9px;
  background: rgb(0 0 0 / 10%);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
}
.empty-note {
  font-size: 13px;
  color: var(--text-dim);
  text-align: center;
  padding: 24px 0;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 0;
  color: var(--text-dim);
}
.empty-icon {
  opacity: 0.5;
}
.empty-state p {
  font-size: 14px;
  color: var(--text-muted);
  text-align: center;
}

/* ── Campaign list ───────────────────────────────────────── */
.campaign-scroll-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 420px);
  overflow-y: auto;
  scrollbar-width: none;
}
.campaign-scroll-area::-webkit-scrollbar {
  display: none;
}

.campaign-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  border-radius: 14px;
  cursor: pointer;
  border: 1px solid var(--border);
  transition:
    border-color 0.2s,
    background 0.2s;
}
.campaign-item:hover:not(.selected) {
  background: rgba(30 34 43 / 0.43);
  border-color: rgba(255, 255, 255, 0.12);
}
.campaign-item.selected {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.07);
}
.ci-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ci-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.ci-subject {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.ci-list {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-dim);
  margin: 0;
}
.ci-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.ci-stats {
  display: flex;
  gap: 8px;
}
.ci-stat {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.ci-stat.green {
  color: #10b981;
}
.ci-stat.blue {
  color: #38bdf8;
}
.ci-date {
  font-size: 11px;
  color: var(--text-dim);
}

/* ── Preview panel ───────────────────────────────────────── */
.preview-panel {
  position: sticky;
  top: 20px;
  min-height: 300px;
  padding: 0;
  overflow: hidden;
}
.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 32px;
  text-align: center;
  color: var(--text-dim);
  min-height: 300px;
}
.preview-empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: rgb(0 0 0 / 8%);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-empty p {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-muted);
  margin: 0;
}
.preview-empty span {
  font-size: 13px;
  color: var(--text-dim);
  max-width: 240px;
}
.preview-content {
  display: flex;
  flex-direction: column;
}
.preview-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 12px;
  flex-wrap: wrap;
}
.preview-name {
  font-size: 15px;
  font-weight: 800;
  color: var(--text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.preview-frame-wrap {
  height: 510px;
  padding: 0 12px 12px;
}
.preview-frame-wrap > * {
  height: 100%;
}
.preview-no-template {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 40px;
  color: var(--text-dim);
  font-size: 13px;
}
.preview-actions {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
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
.preview-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--border);
}
.ps-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 8px;
  gap: 3px;
  border-right: 1px solid var(--border);
}
.ps-item:last-child {
  border-right: none;
}
.ps-val {
  font-size: 18px;
  font-weight: 800;
}
.ps-val.green {
  color: #10b981;
}
.ps-val.blue {
  color: #38bdf8;
}
.ps-val.red {
  color: #ef4444;
}
.ps-lbl {
  font-size: 10px;
  color: var(--text-dim);
  text-align: center;
}

/* ── Activity ────────────────────────────────────────────── */
.activity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.activity-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: rgb(0 0 0 / 5%);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.ac-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}
.ac-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ac-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-email {
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}
.ac-campaign {
  font-size: 11px;
  color: var(--accent-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-time {
  font-size: 10px;
  color: var(--text-dim);
  flex-shrink: 0;
  white-space: nowrap;
  padding-top: 2px;
}

/* ── Badges ──────────────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
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

/* ── Skeletons ───────────────────────────────────────────── */
.skeleton {
  background: linear-gradient(
    90deg,
    rgb(255 255 255 / 4%) 0%,
    rgb(255 255 255 / 9%) 50%,
    rgb(255 255 255 / 4%) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}
.skeleton-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
}
.skeleton-val {
  width: 72px;
  height: 28px;
  margin-bottom: 6px;
}
.skeleton-lbl {
  width: 100px;
  height: 12px;
}
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
.loading-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.skeleton-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
}

/* ── Preview transition ──────────────────────────────────── */
.preview-swap-enter-active,
.preview-swap-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.preview-swap-enter-from,
.preview-swap-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ── Responsive ──────────────────────────────────────────── */

/* Tablet ≤900px */
@media (max-width: 900px) {
  .page-layout {
    margin: 0 20px;
  }
  .dash-main-grid {
    grid-template-columns: 1fr;
  }
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .preview-panel {
    position: static;
  }
  .dash-header {
    flex-direction: column;
    gap: 16px;
  }
}

/* Mobile ≤640px */
@media (max-width: 640px) {
  .page-layout {
    margin: 0 16px;
  }
  .page-main {
    padding: 24px 0;
    gap: 16px;
  }

  /* Header */
  .dash-header {
    gap: 12px;
  }
  .dash-header-left h1 {
    font-size: 22px;
  }
  .dash-header-actions {
    width: 100%;
    gap: 8px;
  }
  .btn-primary,
  .btn-secondary {
    flex: 1;
    justify-content: center;
    min-height: 44px;
    border-radius: 14px;
  }

  /* KPI */
  .kpi-grid {
    gap: 10px;
  }
  .kpi-card {
    padding: 16px 14px;
    gap: 12px;
    border-radius: 14px;
  }
  .kpi-val {
    font-size: 22px;
  }

  /* Panel */
  .panel {
    padding: 18px;
    gap: 14px;
    border-radius: 16px;
  }

  /* Campaign list */
  .campaign-scroll-area {
    max-height: 45vh;
    overscroll-behavior: contain;
  }
  .campaign-item {
    padding: 13px 14px;
    touch-action: manipulation;
  }

  /* Preview */
  .preview-frame-wrap {
    height: 700px;
  }
  .preview-actions {
    flex-wrap: wrap;
  }
  .btn-action {
    min-height: 44px;
    flex: 1;
    justify-content: center;
    border-radius: 10px;
  }
  .preview-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .ps-item {
    border-right: none;
  }
  .ps-item:nth-child(odd) {
    border-right: 1px solid var(--border);
  }
  .ps-item:nth-child(n + 3) {
    border-top: 1px solid var(--border);
  }

  /* Activity */
  .activity-grid {
    grid-template-columns: 1fr;
  }
}

/* Small mobile ≤480px */
@media (max-width: 480px) {
  .page-layout {
    margin: 0 12px;
  }
  .page-main {
    padding: 16px 0;
    gap: 12px;
  }

  /* Header */
  .dash-header {
    gap: 10px;
  }
  .dash-header-left h1 {
    font-size: 20px;
  }
  .dash-header-left p {
    font-size: 13px;
  }
  .dash-header-actions {
    flex-direction: column;
  }
  .btn-primary,
  .btn-secondary {
    width: 100%;
    padding: 13px 16px;
    font-size: 14px;
  }

  /* KPI */
  .kpi-grid {
    gap: 8px;
  }
  .kpi-card {
    padding: 14px 12px;
    gap: 10px;
    border-radius: 12px;
  }
  .kpi-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
  .kpi-val {
    font-size: 20px;
  }
  .kpi-lbl {
    font-size: 11px;
  }

  /* Panel */
  .panel {
    padding: 14px;
    border-radius: 14px;
    gap: 12px;
  }
  .panel-header h2 {
    font-size: 14px;
  }

  /* Campaign list */
  .campaign-scroll-area {
    max-height: 40vh;
  }
  .campaign-item {
    padding: 12px;
    border-radius: 12px;
  }
  .ci-name {
    font-size: 13px;
  }
  .ci-subject {
    font-size: 11px;
  }

  /* Preview */
  .preview-frame-wrap {
    height: 640px;
    padding: 0 8px 8px;
  }
  .preview-header {
    padding: 14px 16px 10px;
  }
  .preview-name {
    font-size: 14px;
  }
  .preview-actions {
    padding: 10px 14px;
    gap: 6px;
  }
  .btn-action {
    font-size: 11px;
    padding: 9px 10px;
    min-height: 40px;
  }
  .ps-val {
    font-size: 16px;
  }
  .ps-lbl {
    font-size: 9px;
  }
  .ps-item {
    padding: 12px 6px;
  }

  /* Activity */
  .activity-card {
    padding: 10px 12px;
    border-radius: 10px;
  }
  .ac-name {
    font-size: 12px;
  }
  .ac-email {
    font-size: 10px;
  }
  .ac-campaign {
    font-size: 10px;
  }
  .ac-time {
    font-size: 10px;
  }
}
</style>
