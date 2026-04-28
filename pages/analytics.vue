<script setup lang="ts">
import {
  Users,
  Mail,
  Eye,
  MousePointerClick,
  RefreshCcw,
  Send,
} from "lucide-vue-next";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  Tooltip,
  Filler,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  Tooltip,
  Filler,
);

definePageMeta({ layout: "app" });

const { t } = useI18n();

const data = ref<any>(null);
const loading = ref(true);

const trendCanvas = ref<HTMLCanvasElement>();
const deviceCanvas = ref<HTMLCanvasElement>();
const perfCanvas = ref<HTMLCanvasElement>();

let trendChart: Chart | null = null;
let deviceChart: Chart | null = null;
let perfChart: Chart | null = null;

const trendShowOpens = ref(true);
const trendShowClicks = ref(true);

function toggleTrendSeries(series: "opens" | "clicks") {
  if (series === "opens") trendShowOpens.value = !trendShowOpens.value;
  else trendShowClicks.value = !trendShowClicks.value;
  if (trendChart) {
    trendChart.setDatasetVisibility(0, trendShowOpens.value);
    trendChart.setDatasetVisibility(1, trendShowClicks.value);
    trendChart.update("active");
  }
}

const DEVICE_COLORS = ["#818cf8", "#38bdf8", "#10b981", "#f59e0b", "#f472b6"];
const GRID = "rgba(255,255,255,0.05)";
const TICK = "#475569";

function destroyCharts() {
  trendChart?.destroy();
  deviceChart?.destroy();
  perfChart?.destroy();
  trendChart = null;
  deviceChart = null;
  perfChart = null;
}

function buildCharts() {
  if (!data.value) return;
  nextTick(() => {
    buildTrendChart();
    buildDeviceChart();
    buildPerfChart();
  });
}

function buildTrendChart() {
  if (!trendCanvas.value) return;
  trendChart?.destroy();
  const ctx = trendCanvas.value.getContext("2d")!;
  const gradOpens = ctx.createLinearGradient(0, 0, 0, 260);
  gradOpens.addColorStop(0, "rgba(129,140,248,0.30)");
  gradOpens.addColorStop(1, "rgba(129,140,248,0)");
  const gradClicks = ctx.createLinearGradient(0, 0, 0, 260);
  gradClicks.addColorStop(0, "rgba(56,189,248,0.22)");
  gradClicks.addColorStop(1, "rgba(56,189,248,0)");

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.value.opensByDay.map((d: any) => d.label),
      datasets: [
        {
          label: t("analytics_page.opens_label"),
          data: data.value.opensByDay.map((d: any) => d.count),
          borderColor: "#818cf8",
          backgroundColor: gradOpens,
          fill: true,
          tension: 0.45,
          pointRadius: 3,
          pointHoverRadius: 7,
          pointBackgroundColor: "#818cf8",
          pointBorderColor: "#03040a",
          pointBorderWidth: 2,
          borderWidth: 2.5,
          hidden: !trendShowOpens.value,
        },
        {
          label: t("analytics_page.clicks_label"),
          data: data.value.clicksByDay.map((d: any) => d.count),
          borderColor: "#38bdf8",
          backgroundColor: gradClicks,
          fill: true,
          tension: 0.45,
          pointRadius: 3,
          pointHoverRadius: 7,
          pointBackgroundColor: "#38bdf8",
          pointBorderColor: "#03040a",
          pointBorderWidth: 2,
          borderWidth: 2.5,
          borderDash: [4, 3],
          hidden: !trendShowClicks.value,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(9,11,20,0.95)",
          borderColor: "rgba(255,255,255,0.10)",
          borderWidth: 1,
          titleColor: "#94a3b8",
          bodyColor: "#f8fafc",
          padding: { x: 14, y: 10 },
          cornerRadius: 10,
          displayColors: true,
          mode: "index",
          intersect: false,
        },
      },
      scales: {
        x: {
          grid: { color: GRID },
          border: { display: false },
          ticks: {
            color: TICK,
            font: { size: 11 },
            maxRotation: 0,
            maxTicksLimit: 7,
          },
        },
        y: {
          grid: { color: GRID },
          border: { display: false },
          beginAtZero: true,
          ticks: {
            color: TICK,
            font: { size: 11 },
            precision: 0,
            maxTicksLimit: 5,
          },
        },
      },
    },
  });
}

function buildDeviceChart() {
  if (!deviceCanvas.value || !data.value.deviceBreakdown.length) return;
  deviceChart?.destroy();
  const ctx = deviceCanvas.value.getContext("2d")!;
  const labels = data.value.deviceBreakdown.map((d: any) => d.label);
  const counts = data.value.deviceBreakdown.map((d: any) => d.count);

  deviceChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: counts,
          backgroundColor: DEVICE_COLORS.slice(0, labels.length),
          hoverBackgroundColor: DEVICE_COLORS.slice(0, labels.length).map(
            (c) => c + "dd",
          ),
          borderColor: "#03040a",
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(9,11,20,0.95)",
          borderColor: "rgba(255,255,255,0.10)",
          borderWidth: 1,
          titleColor: "#94a3b8",
          bodyColor: "#f8fafc",
          padding: { x: 14, y: 10 },
          cornerRadius: 10,
          displayColors: true,
          callbacks: {
            label: (item) => {
              const total = counts.reduce((a: number, b: number) => a + b, 0);
              const pct = Math.round((Number(item.raw) / total) * 100);
              return ` ${item.raw} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function buildPerfChart() {
  if (!perfCanvas.value || !data.value.topCampaigns.length) return;
  perfChart?.destroy();
  const ctx = perfCanvas.value.getContext("2d")!;

  const campaigns = data.value.topCampaigns.slice().reverse();
  const labels = campaigns.map((c: any) =>
    c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name,
  );
  const openRates = campaigns.map((c: any) =>
    c.sentCount ? Math.round((c.openCount / c.sentCount) * 100) : 0,
  );
  const clickRates = campaigns.map((c: any) =>
    c.sentCount ? Math.round((c.clickCount / c.sentCount) * 100) : 0,
  );

  perfChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: t("analytics_page.open_rate_label"),
          data: openRates,
          backgroundColor: "rgba(129,140,248,0.75)",
          hoverBackgroundColor: "#818cf8",
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: t("analytics_page.click_rate_label"),
          data: clickRates,
          backgroundColor: "rgba(56,189,248,0.65)",
          hoverBackgroundColor: "#38bdf8",
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            color: "#94a3b8",
            font: { size: 12 },
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 4,
            useBorderRadius: true,
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: "rgba(9,11,20,0.95)",
          borderColor: "rgba(255,255,255,0.10)",
          borderWidth: 1,
          titleColor: "#94a3b8",
          bodyColor: "#f8fafc",
          padding: { x: 14, y: 10 },
          cornerRadius: 10,
          callbacks: {
            label: (item) => ` ${item.dataset.label}: ${item.parsed.x}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: GRID },
          border: { display: false },
          ticks: {
            color: TICK,
            font: { size: 11 },
            callback: (v) => `${v}%`,
            maxTicksLimit: 6,
          },
          max: 100,
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#94a3b8", font: { size: 12 } },
        },
      },
    },
  });
}

async function fetchAnalytics() {
  loading.value = true;
  const start = Date.now();
  try {
    data.value = await $fetch<any>("/api/analytics");
    destroyCharts();
    buildCharts();
  } finally {
    const elapsed = Date.now() - start;
    if (elapsed < 600) {
      await new Promise((r) => setTimeout(r, 600 - elapsed));
    }
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

function deviceIcon(label: string) {
  if (label === "iOS" || label === "Android") return "📱";
  if (label === "Windows" || label === "Mac") return "💻";
  return "🌐";
}

let timer: any;
onMounted(() => {
  fetchAnalytics();
  timer = setInterval(fetchAnalytics, 30000);
});
onUnmounted(() => {
  clearInterval(timer);
  destroyCharts();
});
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

        <!-- Chart row 1: Trend + Device -->
        <div class="chart-row-main">
          <!-- Opens Trend -->
          <div class="panel chart-trend-panel">
            <div class="panel-head">
              <div>
                <h2>{{ t("analytics_page.opens_trend") }}</h2>
                <span class="panel-sub">{{
                  t("analytics_page.last_14_days")
                }}</span>
              </div>
              <div class="trend-controls">
                <button
                  class="trend-pill"
                  :class="{ active: trendShowOpens, 'pill-purple': true }"
                  @click="toggleTrendSeries('opens')"
                >
                  <span class="pill-dot purple" />
                  {{ t("analytics_page.opens_label") }}
                </button>
                <button
                  class="trend-pill"
                  :class="{ active: trendShowClicks, 'pill-blue': true }"
                  @click="toggleTrendSeries('clicks')"
                >
                  <span class="pill-dot blue" />
                  {{ t("analytics_page.clicks_label") }}
                </button>
              </div>
            </div>
            <div class="chart-wrap trend-wrap">
              <canvas ref="trendCanvas" />
            </div>
          </div>

          <!-- Device Breakdown -->
          <div class="panel chart-device-panel">
            <div class="panel-head">
              <div>
                <h2>{{ t("analytics_page.device_breakdown") }}</h2>
                <span class="panel-sub">{{
                  t("analytics_page.opens_label")
                }}</span>
              </div>
            </div>
            <div v-if="!data.deviceBreakdown.length" class="empty-note">
              {{ t("analytics_page.no_data") }}
            </div>
            <template v-else>
              <div class="chart-wrap donut-wrap">
                <canvas ref="deviceCanvas" />
                <div class="donut-center">
                  <span class="donut-total">{{ data.totalOpened }}</span>
                  <span class="donut-lbl">total</span>
                </div>
              </div>
              <div class="device-legend">
                <div
                  v-for="(d, i) in data.deviceBreakdown"
                  :key="d.label"
                  class="device-leg-item"
                >
                  <span
                    class="leg-dot"
                    :style="{
                      background: [
                        '#818cf8',
                        '#38bdf8',
                        '#10b981',
                        '#f59e0b',
                        '#f472b6',
                      ][i],
                    }"
                  />
                  <span class="leg-icon">{{ deviceIcon(d.label) }}</span>
                  <span class="leg-label">{{ d.label }}</span>
                  <span class="leg-count">{{ d.count }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Chart row 2: Campaign Performance -->
        <div class="panel chart-perf-panel">
          <div class="panel-head">
            <div>
              <h2>{{ t("analytics_page.campaign_performance") }}</h2>
              <span class="panel-sub">{{
                t("analytics_page.top_campaigns")
              }}</span>
            </div>
            <!-- Delivery Funnel mini stats -->
            <div v-if="data.totalSent > 0" class="funnel-row">
              <div class="funnel-stat">
                <Send :size="13" />
                <span>{{ data.totalSent.toLocaleString() }}</span>
                <span class="funnel-lbl">{{
                  t("analytics_page.sent_label")
                }}</span>
              </div>
              <div class="funnel-arrow">→</div>
              <div class="funnel-stat green">
                <Eye :size="13" />
                <span>{{ data.totalOpened.toLocaleString() }}</span>
                <span class="funnel-lbl">{{
                  t("analytics_page.opens_label")
                }}</span>
              </div>
              <div class="funnel-arrow">→</div>
              <div class="funnel-stat blue">
                <MousePointerClick :size="13" />
                <span>{{ data.totalClicked.toLocaleString() }}</span>
                <span class="funnel-lbl">{{
                  t("analytics_page.clicks_label")
                }}</span>
              </div>
            </div>
          </div>
          <div v-if="!data.topCampaigns.length" class="empty-note">
            {{ t("analytics_page.no_data") }}
          </div>
          <div v-else class="chart-wrap perf-wrap">
            <canvas ref="perfCanvas" />
          </div>
        </div>

        <!-- Bottom panels: Recent opens + Top campaigns -->
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
                    <span v-if="ev.contactName" class="ev-name">{{
                      ev.contactName
                    }}</span>
                    <span v-if="ev.contactCompany" class="ev-company">
                      {{ ev.contactName ? "• " : "" }}{{ ev.contactCompany }}
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
  backdrop-filter: blur(5px);
}
.btn-refresh:hover {
  background: rgb(0 0 0 / 6%);
}
.btn-refresh:active {
  transform: scale(0.92);
}
.spin {
  animation: spin 0.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
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

/* ── KPI ──────────────────────────────────────────────────── */
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

/* ── Panel base ───────────────────────────────────────────── */
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
.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.panel-sub {
  display: block;
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 2px;
}
.empty-note {
  font-size: 13px;
  color: var(--text-dim);
  text-align: center;
  padding: 24px 0;
}

/* ── Chart wrappers ───────────────────────────────────────── */
.chart-wrap {
  position: relative;
  width: 100%;
}
.trend-wrap {
  flex: 1;
  min-height: 220px;
}
.donut-wrap {
  height: 180px;
  flex-shrink: 0;
}
.perf-wrap {
  height: 260px;
}

/* ── Chart row 1: Trend + Device ─────────────────────────── */
.chart-row-main {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  align-items: stretch;
}
.chart-trend-panel {
}
.chart-device-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Trend badge */
.trend-controls {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.trend-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 20px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.trend-pill.active.pill-purple {
  color: #818cf8;
  background: rgba(129, 140, 248, 0.1);
  border-color: rgba(129, 140, 248, 0.3);
}
.trend-pill.active.pill-blue {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
}
.trend-pill:hover:not(.active) {
  background: rgb(255 255 255 / 4%);
  color: var(--text-muted);
}
.pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pill-dot.purple {
  background: #818cf8;
}
.pill-dot.blue {
  background: #38bdf8;
}

/* Donut center overlay */
.donut-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.donut-center {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.donut-total {
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
  line-height: 1.1;
}
.donut-lbl {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 2px;
}

/* Device legend */
.device-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.device-leg-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.leg-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.leg-icon {
  font-size: 14px;
  line-height: 1;
}
.leg-label {
  flex: 1;
  color: var(--text-muted);
  font-weight: 500;
}
.leg-count {
  font-weight: 700;
  color: var(--text);
  font-size: 13px;
}

/* ── Campaign Performance panel ──────────────────────────── */
.chart-perf-panel {
}

/* Funnel row */
.funnel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.funnel-stat {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  background: rgb(0 0 0 / 10%);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 5px 10px;
}
.funnel-stat.green {
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.07);
}
.funnel-stat.blue {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.25);
  background: rgba(56, 189, 248, 0.07);
}
.funnel-lbl {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.7;
}
.funnel-arrow {
  color: var(--text-dim);
  font-size: 14px;
  font-weight: 300;
}

/* ── Two cols bottom ──────────────────────────────────────── */
.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* ── Events list ──────────────────────────────────────────── */
.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 6px;
}
.event-list::-webkit-scrollbar {
  width: 4px;
}
.event-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
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
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-light);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 2px;
}
.ev-name {
  display: inline-block;
  font-size: 12px;
  color: var(--text-muted);
}
.ev-company {
  display: inline-block;
  font-size: 13px;
  color: var(--accent-light);
  font-weight: 500;
  margin-bottom: 4px;
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

/* ── Campaign list ────────────────────────────────────────── */
.campaign-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 6px;
}
.campaign-list::-webkit-scrollbar {
  width: 4px;
}
.campaign-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
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
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
  margin-bottom: 4px;
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
  font-size: 12px;
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

/* ── Responsive ───────────────────────────────────────────── */
@media (max-width: 1100px) {
  .chart-row-main {
    grid-template-columns: 1fr;
  }
  .chart-device-panel {
    flex-direction: row;
    align-items: center;
    gap: 24px;
  }
  .donut-wrap {
    height: 160px;
    width: 160px;
    flex-shrink: 0;
  }
  .device-legend {
    flex: 1;
  }
}

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
  .chart-device-panel {
    flex-direction: column;
    align-items: stretch;
  }
  .donut-wrap {
    width: 100%;
  }
  .perf-wrap {
    height: 220px;
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
  .funnel-row {
    gap: 4px;
  }
  .funnel-stat {
    font-size: 11px;
    padding: 4px 8px;
  }
  .trend-controls {
    gap: 6px;
  }
  .trend-pill {
    font-size: 11px;
    padding: 4px 10px;
  }
  .trend-wrap {
    height: 180px;
  }
  .perf-wrap {
    height: 200px;
  }
  .panel-head {
    flex-direction: column;
    align-items: flex-start;
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
  .funnel-row {
    flex-wrap: wrap;
  }
  .funnel-arrow {
    display: none;
  }
}
</style>
