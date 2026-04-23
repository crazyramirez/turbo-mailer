<script setup lang="ts">
import {
  Users,
  Mail,
  Eye,
  MousePointerClick,
  RefreshCcw,
  TrendingUp,
} from "lucide-vue-next";

definePageMeta({ layout: "app" });

const { t } = useI18n();

const data = ref<any>(null);
const loading = ref(true);

async function fetchAnalytics() {
  loading.value = true;
  try {
    data.value = await $fetch<any>("/api/analytics");
  } finally {
    loading.value = false;
  }
}

function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(typeof d === "number" ? d * 1000 : d).toLocaleString(
    "es-ES",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function openRate(c: any) {
  if (!c.sentCount) return "0%";
  return `${Math.round((c.openCount / c.sentCount) * 100)}%`;
}
function clickRate(c: any) {
  if (!c.sentCount) return "0%";
  return `${Math.round((c.clickCount / c.sentCount) * 100)}%`;
}

function parseUA(ua: string) {
  if (!ua) return t("common.unknown");
  if (ua.includes("iPhone") || ua.includes("iPad")) return "📱 iOS";
  if (ua.includes("Android")) return "📱 Android";
  if (ua.includes("Windows")) return "💻 Windows";
  if (ua.includes("Mac")) return "💻 Mac";
  return "🌐 Web";
}

// Auto-refresh every 30s
let timer: any;
onMounted(() => {
  fetchAnalytics();
  timer = setInterval(fetchAnalytics, 30000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-layout">
    <main class="page-main">
      <div class="page-header">
        <div>
          <h1>{{ t("analytics_page.title") }}</h1>
          <p>{{ t("analytics_page.subtitle") }}</p>
        </div>
        <button
          class="btn-refresh"
          @click="fetchAnalytics"
          :title="t('common.loading')"
        >
          <RefreshCcw :size="15" :class="{ spin: loading }" />
        </button>
      </div>

      <div v-if="loading && !data" class="loading-state">
        {{ t("common.loading") }}
      </div>

      <template v-else-if="data">
        <!-- KPI cards -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon blue"><Users :size="22" /></div>
            <div>
              <div class="kpi-val">
                {{ data.totalContacts.toLocaleString() }}
              </div>
              <div class="kpi-lbl">
                {{ t("analytics_page.total_contacts") }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon purple"><Mail :size="22" /></div>
            <div>
              <div class="kpi-val">{{ data.totalCampaigns }}</div>
              <div class="kpi-lbl">
                {{ t("analytics_page.total_campaigns") }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon green"><Eye :size="22" /></div>
            <div>
              <div class="kpi-val">{{ data.avgOpenRate }}%</div>
              <div class="kpi-lbl">{{ t("analytics_page.avg_open_rate") }}</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon orange"><MousePointerClick :size="22" /></div>
            <div>
              <div class="kpi-val">{{ data.avgClickRate }}%</div>
              <div class="kpi-lbl">
                {{ t("analytics_page.avg_click_rate") }}
              </div>
            </div>
          </div>
        </div>

        <div class="two-cols">
          <!-- Recent opens -->
          <div class="panel">
            <h2>{{ t("analytics_page.recent_opens") }}</h2>
            <div v-if="data.recentOpens.length === 0" class="empty-note">
              {{ t("analytics_page.no_data") }}
            </div>
            <div v-else class="event-list">
              <div
                v-for="ev in data.recentOpens"
                :key="ev.id"
                class="event-row"
              >
                <div class="ev-dot" />
                <div class="ev-body">
                  <span class="ev-email">{{ ev.contactEmail || ev.ip }}</span>
                  <div class="ev-info">
                    <span v-if="ev.contactName" class="ev-name">{{ ev.contactName }}</span>
                    <span v-if="ev.contactCompany" class="ev-company">
                      {{ ev.contactName ? '• ' : '' }}{{ ev.contactCompany }}
                    </span>
                  </div>
                  <span class="ev-campaign">{{ ev.campaignName }}</span>
                </div>
                <div class="ev-meta">
                  <span class="ev-device">{{ parseUA(ev.userAgent) }}</span>
                  <span class="ev-time">{{ fmtDate(ev.createdAt) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Top campaigns -->
          <div class="panel">
            <h2>{{ t("analytics_page.top_campaigns") }}</h2>
            <div v-if="data.topCampaigns.length === 0" class="empty-note">
              {{ t("analytics_page.no_data") }}
            </div>
            <div v-else class="campaign-list">
              <div
                v-for="(c, i) in data.topCampaigns as any[]"
                :key="c.id"
                class="campaign-row"
              >
                <span class="rank">{{ (i as number) + 1 }}</span>
                <div class="camp-body">
                  <NuxtLink :to="`/campaigns/${c.id}`" class="camp-name">{{
                    c.name
                  }}</NuxtLink>
                  <div class="camp-stats">
                    <span class="cs green">{{ openRate(c) }} aperturas</span>
                    <span class="cs blue">{{ clickRate(c) }} clicks</span>
                    <span class="cs dim">{{ c.sentCount }} enviados</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
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
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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
.btn-refresh {
  width: 36px;
  height: 36px;
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
  background: rgb(0 0 0 / 6%);
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-dim);
  padding: 80px;
}

/* KPI */
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

/* Two cols */
.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 900px) {
  .two-cols {
    grid-template-columns: 1fr;
  }
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.panel {
  background: rgb(0 0 0 / 6%);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel h2 {
  font-size: 15px;
  font-weight: 800;
}
.empty-note {
  font-size: 13px;
  color: var(--text-dim);
  text-align: center;
  padding: 24px 0;
}

/* Events */
.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.event-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.ev-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  margin-top: 5px;
  flex-shrink: 0;
}
.ev-body {
  flex: 1;
  min-width: 0;
}
.ev-email {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-light);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ev-name {
  display: inline-block;
  font-size: 12px;
  color: var(--text-muted);
}
.ev-company {
  display: inline-block;
  font-size: 11px;
  color: var(--accent-light);
  font-weight: 500;
  margin-left: 4px;
}
.ev-info {
  display: flex;
  align-items: center;
}
.ev-campaign {
  display: block;
  font-size: 11px;
  color: var(--text-dim);
}
.ev-meta {
  text-align: right;
  flex-shrink: 0;
}
.ev-device {
  display: block;
  font-size: 12px;
}
.ev-time {
  display: block;
  font-size: 11px;
  color: var(--text-dim);
}

/* Campaigns */
.campaign-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.campaign-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.rank {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgb(0 0 0 / 5%);
  font-size: 12px;
  font-weight: 800;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.camp-body {
  flex: 1;
}
.camp-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
}
.camp-name:hover {
  color: var(--accent-light);
}
.camp-stats {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.cs {
  font-size: 11px;
  font-weight: 600;
}
.cs.green {
  color: #10b981;
}
.cs.blue {
  color: #38bdf8;
}
.cs.dim {
  color: var(--text-dim);
}

/* ── Responsive ──────────────────────────────────────────── */

@media (max-width: 900px) {
  .two-cols {
    grid-template-columns: 1fr;
  }
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .page-layout {
    margin: 0 20px;
  }
  .page-main {
    padding: 32px 0;
    gap: 20px;
  }
}

@media (max-width: 640px) {
  .page-layout {
    margin: 0 16px;
  }
  .page-main {
    padding: 24px 0;
    gap: 16px;
  }
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .page-header h1 {
    font-size: 22px;
  }
  .btn-refresh {
    align-self: flex-end;
  }
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
  .panel {
    padding: 16px;
    border-radius: 14px;
    gap: 12px;
  }
  .event-row {
    gap: 8px;
  }
  .ev-meta {
    text-align: left;
    flex-shrink: 1;
  }
  .ev-device {
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .page-layout {
    margin: 0 12px;
  }
  .page-main {
    padding: 16px 0;
    gap: 12px;
  }
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
  .panel {
    padding: 14px;
    border-radius: 12px;
  }
  .event-row {
    flex-direction: column;
    gap: 6px;
  }
  .ev-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .ev-time {
    display: inline;
  }
}
</style>
