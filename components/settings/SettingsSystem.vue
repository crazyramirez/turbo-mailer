<script setup lang="ts">
import { Cpu, Timer, Play, Loader2, RefreshCw, ScrollText } from "lucide-vue-next";

const { t } = useI18n();
const { showToast } = useDashboardState();

const sys = ref<any>(null);
const runningJob = ref<string | null>(null);
async function refresh() {
  sys.value = await $fetch<any>("/api/settings/system").catch(() => null);
}
onMounted(refresh);

async function run(name: string) {
  runningJob.value = name;
  try {
    const r = await $fetch<any>("/api/settings/jobs", { method: "POST", body: { name } });
    showToast(r.lastError ? `${name}: ${r.lastError}` : t("settings.system.job_ok", { name, ms: r.lastDurationMs }), r.lastError ? "error" : "success");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    runningJob.value = null;
    refresh();
  }
}

const fmtSize = (n: number) => (n > 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtNum = (n: number) => new Intl.NumberFormat().format(n || 0);
const fmtDate = (s: number | null) => (s ? new Date(s).toLocaleString() : "—");
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function every(j: any) {
  return j.dailyAtHour !== null ? t("settings.system.daily_at", { h: String(j.dailyAtHour).padStart(2, "0") }) : t("settings.system.every", { m: j.everyMinutes });
}
</script>

<template>
  <div v-if="sys" class="tm-main" style="padding: 0">
    <div class="tm-kpis">
      <div class="tm-kpi"><span class="tm-kpi-label">{{ t("settings.system.version") }}</span><span class="tm-kpi-value">{{ sys.version }}</span><span class="tm-kpi-sub">Node {{ sys.node }} · {{ sys.platform }}</span></div>
      <div class="tm-kpi"><span class="tm-kpi-label">{{ t("settings.system.uptime") }}</span><span class="tm-kpi-value">{{ fmtUptime(sys.uptimeSec) }}</span><span class="tm-kpi-sub">{{ sys.memoryMb }} MB RAM</span></div>
      <div class="tm-kpi"><span class="tm-kpi-label">{{ t("settings.system.database") }}</span><span class="tm-kpi-value">{{ fmtSize(sys.db.sizeBytes) }}</span><span class="tm-kpi-sub">{{ sys.db.journal }} · {{ sys.db.migrations ?? "?" }} {{ t("settings.system.migrations") }}</span></div>
      <div class="tm-kpi" :class="sys.activeCampaigns.length ? 'ok' : ''"><span class="tm-kpi-label">{{ t("settings.system.sending_now") }}</span><span class="tm-kpi-value">{{ sys.activeCampaigns.length }}</span><span class="tm-kpi-sub">{{ t("settings.system.campaigns") }}</span></div>
    </div>

    <div class="tm-grid-2">
      <section class="tm-card">
        <h3 class="tm-card-title">
          <span class="tm-title-left"><Timer :size="14" /> {{ t("settings.system.jobs") }}</span>
          <button class="tm-btn tm-btn-sm tm-btn-ghost" @click="refresh"><RefreshCw :size="12" /></button>
        </h3>
        <div class="tm-table-wrap">
          <table class="tm-table">
            <thead><tr><th>{{ t("settings.system.job") }}</th><th>{{ t("settings.system.frequency") }}</th><th>{{ t("settings.system.last_run") }}</th><th></th></tr></thead>
            <tbody>
              <tr v-for="j in sys.jobs" :key="j.name">
                <td><span class="tm-dot" :class="j.lastError ? 'bad' : j.running ? 'info' : j.lastRunAt ? 'ok' : 'warn'" /> <span class="tm-mono">{{ j.name }}</span>
                  <div v-if="j.lastError" class="tm-muted" style="font-size: 11px; color: #fb7185">{{ j.lastError }}</div></td>
                <td class="tm-muted">{{ every(j) }}</td>
                <td class="tm-muted">{{ fmtDate(j.lastRunAt) }}<span v-if="j.lastDurationMs"> · {{ j.lastDurationMs }} ms</span></td>
                <td class="num">
                  <button class="tm-btn tm-btn-sm tm-btn-ghost" :disabled="j.running || runningJob !== null" :title="t('settings.system.run')" @click="run(j.name)">
                    <Loader2 v-if="runningJob === j.name || j.running" :size="12" class="tm-spin" /><Play v-else :size="12" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><Cpu :size="14" /> {{ t("settings.system.data") }}</span></h3>
        <ul class="tm-check-list">
          <li><span class="tm-dot info" />{{ t("settings.system.contacts") }}: <strong>{{ fmtNum(sys.counts.contacts) }}</strong></li>
          <li><span class="tm-dot info" />{{ t("settings.system.campaigns") }}: <strong>{{ fmtNum(sys.counts.campaigns) }}</strong></li>
          <li><span class="tm-dot info" />{{ t("settings.system.sends") }}: <strong>{{ fmtNum(sys.counts.sends) }}</strong></li>
          <li><span class="tm-dot info" />{{ t("settings.system.events") }}: <strong>{{ fmtNum(sys.counts.events) }}</strong></li>
          <li><span class="tm-dot info" />{{ t("settings.system.suppressions") }}: <strong>{{ fmtNum(sys.counts.suppressions) }}</strong></li>
        </ul>
        <div class="tm-field"><label>{{ t("settings.system.data_dir") }}</label><code class="tm-pre">{{ sys.dataDir }}</code></div>
        <div class="tm-actions" style="justify-content: flex-start">
          <NuxtLink to="/audit" class="tm-btn tm-btn-sm"><ScrollText :size="12" /> {{ t("settings.system.audit") }}</NuxtLink>
        </div>
      </section>
    </div>
  </div>
  <div v-else class="tm-loading"><Loader2 :size="18" class="tm-spin" /></div>
</template>
