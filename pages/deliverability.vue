<script setup lang="ts">
import {
  Gauge, RefreshCcw, Loader2, ShieldCheck, Globe2, Ban, FileBarChart, Inbox, Flame, Search, Trash2, Plus, X, MailWarning,
} from "lucide-vue-next";

definePageMeta({ layout: "app" });
const { t, locale } = useI18n();
const { showToast, showDialog } = useDashboardState();

const data = ref<any>(null);
const loading = ref(true);
const busy = ref<"" | "blocklists" | "inbound">("");

async function load() {
  loading.value = true;
  try {
    data.value = await $fetch("/api/deliverability/overview");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    loading.value = false;
  }
}

async function runBlocklists() {
  busy.value = "blocklists";
  try {
    data.value.blocklists = await $fetch("/api/deliverability/blocklists", { method: "POST" });
    showToast(t("deliv.blocklists_done"), "success");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    busy.value = "";
  }
}

async function runInbound() {
  busy.value = "inbound";
  try {
    const r = await $fetch<any>("/api/deliverability/inbound", { method: "POST" });
    showToast(t("deliv.inbound_done", { checked: r.checked, bounced: r.bounced, complaints: r.complaints ?? 0 }), r.errors?.length ? "error" : "success");
    await load();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    busy.value = "";
  }
}

const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "—" : `${(n * 100).toFixed(digits)}%`;
const fmt = (n: number) => new Intl.NumberFormat(locale.value === "es" ? "es-ES" : "en-US").format(n || 0);
const fmtDate = (d: string | number | null) =>
  d ? new Date(typeof d === "number" ? d * 1000 : d).toLocaleString(locale.value === "es" ? "es-ES" : "en-US", { dateStyle: "short", timeStyle: "short" }) : "—";

// Thresholds used by Gmail/Yahoo sender guidelines and industry practice
function rateClass(kind: "bounce" | "block" | "complaint", v: number) {
  const th = { bounce: [0.02, 0.05], block: [0.01, 0.05], complaint: [0.001, 0.003] }[kind];
  return v >= th[1] ? "bad" : v >= th[0] ? "warn" : "ok";
}

const totals = computed(() => {
  const rows = data.value?.reputation ?? [];
  const sum = (k: string) => rows.reduce((a: number, r: any) => a + (r[k] || 0), 0);
  const attempted = sum("attempted");
  const delivered = sum("delivered");
  return {
    attempted,
    bounceRate: attempted ? sum("hard") / attempted : 0,
    blockRate: attempted ? sum("blocked") / attempted : 0,
    complaintRate: delivered ? sum("complaints") / delivered : 0,
  };
});

const suppressionTotal = computed(() =>
  Object.values(data.value?.suppression ?? {}).reduce((a: number, b: any) => a + Number(b || 0), 0),
);

function domainChecks(d: any) {
  const out: { status: string; text: string }[] = [];
  if (d.error) return [{ status: "info", text: t("deliv.dns_unknown") }];
  if (d.spf?.unknown) out.push({ status: "info", text: t("deliv.spf_unknown") });
  else if (!d.spf?.record) out.push({ status: "bad", text: t("deliv.spf_missing") });
  else if (d.spf.multipleRecords) out.push({ status: "bad", text: t("deliv.spf_multiple") });
  else if (d.spf.tooMany) out.push({ status: "bad", text: t("deliv.spf_lookups", { n: d.spf.lookups }) });
  else out.push({ status: d.spf.allQualifier === "+" ? "warn" : "ok", text: t("deliv.spf_ok", { n: d.spf.lookups, q: d.spf.allQualifier ?? "?" }) });

  if (d.dkim) {
    if (d.dkim.unknown) out.push({ status: "info", text: t("deliv.dkim_unknown") });
    else if (!d.dkim.found) out.push({ status: "bad", text: t("deliv.dkim_missing", { s: d.dkim.selector }) });
    else out.push({ status: d.dkim.bits && d.dkim.bits < 2048 ? "warn" : "ok", text: t("deliv.dkim_ok", { s: d.dkim.selector, bits: d.dkim.bits ?? "?" }) });
    out.push({ status: d.dkimAligned ? "ok" : "warn", text: d.dkimAligned ? t("deliv.aligned") : t("deliv.not_aligned") });
  } else {
    out.push({ status: "warn", text: t("deliv.dkim_not_configured") });
  }

  if (d.dmarc?.unknown) out.push({ status: "info", text: t("deliv.dmarc_unknown") });
  else if (!d.dmarc?.record) out.push({ status: "bad", text: t("deliv.dmarc_missing") });
  else out.push({ status: d.dmarc.policy === "none" ? "warn" : "ok", text: t("deliv.dmarc_ok", { p: d.dmarc.policy, rua: d.dmarc.hasRua ? "✓" : "✗" }) });

  if (!d.mx?.unknown) out.push({ status: d.mx?.found ? "ok" : "warn", text: d.mx?.found ? t("deliv.mx_ok") : t("deliv.mx_missing") });
  out.push({ status: d.bimi ? "ok" : "info", text: d.bimi ? t("deliv.bimi_ok") : t("deliv.bimi_missing") });
  out.push({ status: d.mtaSts ? "ok" : "info", text: d.mtaSts ? t("deliv.mtasts_ok") : t("deliv.mtasts_missing") });
  return out;
}

// ── Suppression list ─────────────────────────────────────────────────────
const sup = reactive({ rows: [] as any[], total: 0, q: "", reason: "", offset: 0, loading: false });
const SUP_LIMIT = 50;
async function loadSup() {
  sup.loading = true;
  try {
    const r = await $fetch<any>("/api/suppressions", { query: { q: sup.q || undefined, reason: sup.reason || undefined, limit: SUP_LIMIT, offset: sup.offset } });
    sup.rows = r.rows;
    sup.total = r.total;
  } finally {
    sup.loading = false;
  }
}
let supTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => [sup.q, sup.reason], () => {
  sup.offset = 0;
  if (supTimer) clearTimeout(supTimer);
  supTimer = setTimeout(loadSup, 250);
});

const showAdd = ref(false);
const addText = ref("");
const addNote = ref("");
async function addSuppressions() {
  try {
    const r = await $fetch<any>("/api/suppressions", { method: "POST", body: { emails: addText.value, note: addNote.value } });
    showToast(t("deliv.sup_added", { n: r.added }), "success");
    showAdd.value = false;
    addText.value = "";
    addNote.value = "";
    await Promise.all([loadSup(), load()]);
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}
async function removeSup(row: any) {
  const ok = await showDialog({
    type: "confirm",
    title: t("deliv.sup_remove_title"),
    message: row.reason === "complained" ? t("deliv.sup_remove_complaint") : t("deliv.sup_remove_msg", { e: row.emailHint }),
  });
  if (!ok) return;
  try {
    await $fetch(`/api/suppressions/${row.id}`, { method: "DELETE", query: row.reason === "complained" ? { force: "1" } : {} });
    await Promise.all([loadSup(), load()]);
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}

// ── Placement tests ──────────────────────────────────────────────────────
const tests = ref<any[]>([]);
async function loadTests() {
  tests.value = await $fetch<any[]>("/api/placement-tests").catch(() => []);
}
const PLACEMENT_CLASS: Record<string, string> = { inbox: "ok", promotions: "info", spam: "bad", missing: "warn", error: "bad", pending: "" };

onMounted(() => {
  load();
  loadSup();
  loadTests();
});
</script>

<template>
  <div class="tm-page">
    <main class="tm-main">
      <div class="tm-header">
        <div class="tm-header-left">
          <Gauge :size="30" class="tm-header-icon" />
          <div>
            <h1>{{ t("deliv.title") }}</h1>
            <p class="tm-sub">{{ t("deliv.subtitle") }}</p>
          </div>
        </div>
        <div class="tm-actions">
          <button class="tm-btn" :disabled="!!busy || !data?.inbound?.configured" @click="runInbound" :title="t('deliv.inbound_hint')">
            <Loader2 v-if="busy === 'inbound'" :size="14" class="tm-spin" /><Inbox v-else :size="14" />
            {{ t("deliv.process_inbound") }}
          </button>
          <button class="tm-btn" :disabled="!!busy" @click="runBlocklists">
            <Loader2 v-if="busy === 'blocklists'" :size="14" class="tm-spin" /><Ban v-else :size="14" />
            {{ t("deliv.check_blocklists") }}
          </button>
          <button class="tm-btn tm-icon-btn" :disabled="loading" @click="load" :title="t('common.refresh')">
            <RefreshCcw :size="14" :class="{ 'tm-spin': loading }" />
          </button>
        </div>
      </div>

      <div v-if="loading && !data" class="tm-loading"><Loader2 :size="18" class="tm-spin" /> {{ t("common.loading") }}</div>

      <template v-else-if="data">
        <!-- KPIs -->
        <div class="tm-kpis">
          <div class="tm-kpi" :class="rateClass('bounce', totals.bounceRate)">
            <span class="tm-kpi-label">{{ t("deliv.kpi_bounce") }}</span>
            <span class="tm-kpi-value">{{ pct(totals.bounceRate, 2) }}</span>
            <span class="tm-kpi-sub">{{ t("deliv.kpi_bounce_hint") }}</span>
          </div>
          <div class="tm-kpi" :class="rateClass('complaint', totals.complaintRate)">
            <span class="tm-kpi-label">{{ t("deliv.kpi_complaints") }}</span>
            <span class="tm-kpi-value">{{ pct(totals.complaintRate, 3) }}</span>
            <span class="tm-kpi-sub">{{ t("deliv.kpi_complaints_hint") }}</span>
          </div>
          <div class="tm-kpi" :class="rateClass('block', totals.blockRate)">
            <span class="tm-kpi-label">{{ t("deliv.kpi_blocks") }}</span>
            <span class="tm-kpi-value">{{ pct(totals.blockRate, 2) }}</span>
            <span class="tm-kpi-sub">{{ t("deliv.kpi_blocks_hint") }}</span>
          </div>
          <div class="tm-kpi" :class="data.dmarc.passRate === null ? '' : data.dmarc.passRate > 0.98 ? 'ok' : data.dmarc.passRate > 0.9 ? 'warn' : 'bad'">
            <span class="tm-kpi-label">{{ t("deliv.kpi_dmarc") }}</span>
            <span class="tm-kpi-value">{{ pct(data.dmarc.passRate) }}</span>
            <span class="tm-kpi-sub">{{ t("deliv.kpi_dmarc_hint", { n: data.dmarc.reports }) }}</span>
          </div>
          <div class="tm-kpi">
            <span class="tm-kpi-label">{{ t("deliv.kpi_suppressed") }}</span>
            <span class="tm-kpi-value">{{ fmt(suppressionTotal as number) }}</span>
            <span class="tm-kpi-sub">{{ t("deliv.kpi_sent_30d", { n: fmt(totals.attempted) }) }}</span>
          </div>
        </div>

        <!-- Domains -->
        <div class="tm-grid">
          <section v-for="d in data.domains" :key="d.domain" class="tm-card">
            <h3 class="tm-card-title">
              <span class="tm-title-left"><Globe2 :size="14" /> {{ d.domain }}</span>
              <span class="tm-badge">{{ d.profile }}</span>
            </h3>
            <ul class="tm-check-list">
              <li v-for="(c, i) in domainChecks(d)" :key="i"><span class="tm-dot" :class="c.status" />{{ c.text }}</li>
            </ul>
          </section>
          <section v-if="!data.domains.length" class="tm-card">
            <p class="tm-hint">{{ t("deliv.no_profiles") }}</p>
          </section>
        </div>

        <!-- Reputation by provider -->
        <section class="tm-card">
          <h3 class="tm-card-title"><span class="tm-title-left"><ShieldCheck :size="14" /> {{ t("deliv.reputation") }}</span></h3>
          <div v-if="!data.reputation.length" class="tm-empty">{{ t("deliv.no_sends_30d") }}</div>
          <div v-else class="tm-table-wrap">
            <table class="tm-table">
              <thead>
                <tr>
                  <th>{{ t("deliv.provider") }}</th>
                  <th class="num">{{ t("deliv.attempted") }}</th>
                  <th class="num">{{ t("deliv.bounces") }}</th>
                  <th class="num">{{ t("deliv.blocks") }}</th>
                  <th class="num">{{ t("deliv.complaints") }}</th>
                  <th class="num">{{ t("deliv.opens") }}</th>
                  <th class="num">{{ t("deliv.clicks") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in data.reputation" :key="r.provider">
                  <td><strong>{{ t(`deliv.providers.${r.provider}`) }}</strong></td>
                  <td class="num">{{ fmt(r.attempted) }}</td>
                  <td class="num"><span class="tm-badge" :class="rateClass('bounce', r.bounceRate)">{{ pct(r.bounceRate, 2) }}</span></td>
                  <td class="num"><span class="tm-badge" :class="rateClass('block', r.blockRate)">{{ pct(r.blockRate, 2) }}</span></td>
                  <td class="num"><span class="tm-badge" :class="rateClass('complaint', r.complaintRate)">{{ pct(r.complaintRate, 3) }}</span></td>
                  <td class="num">{{ pct(r.openRate) }}</td>
                  <td class="num">{{ pct(r.clickRate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="tm-hint">{{ t("deliv.reputation_hint") }}</p>
        </section>

        <div class="tm-grid-2">
          <!-- Blocklists -->
          <section class="tm-card">
            <h3 class="tm-card-title">
              <span class="tm-title-left"><Ban :size="14" /> {{ t("deliv.blocklists") }}</span>
              <span class="tm-muted">{{ fmtDate(data.blocklists.checkedAt) }}</span>
            </h3>
            <div v-if="!data.blocklists.checkedAt" class="tm-empty">{{ t("deliv.blocklists_never") }}</div>
            <div v-else class="tm-table-wrap">
              <table class="tm-table">
                <tbody>
                  <tr v-for="r in data.blocklists.results" :key="r.target + r.zone">
                    <td class="tm-mono">{{ r.target }}</td>
                    <td>{{ r.name }}</td>
                    <td class="num">
                      <span class="tm-badge" :class="r.result === 'listed' ? 'bad' : r.result === 'clean' ? 'ok' : ''" :title="r.detail || ''">
                        {{ t(`deliv.bl_${r.result}`) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="tm-hint">{{ t("deliv.blocklists_hint") }}</p>
          </section>

          <!-- DMARC -->
          <section class="tm-card">
            <h3 class="tm-card-title"><span class="tm-title-left"><FileBarChart :size="14" /> {{ t("deliv.dmarc_reports") }}</span></h3>
            <div v-if="!data.dmarc.recent.length" class="tm-empty">{{ t("deliv.dmarc_none_yet") }}</div>
            <template v-else>
              <div class="tm-table-wrap">
                <table class="tm-table">
                  <thead>
                    <tr><th>{{ t("deliv.reporter") }}</th><th>{{ t("deliv.period") }}</th><th class="num">{{ t("deliv.messages") }}</th><th class="num">DMARC</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in data.dmarc.recent" :key="r.orgName + r.dateBegin">
                      <td>{{ r.orgName }}</td>
                      <td class="tm-muted">{{ fmtDate(r.dateBegin) }}</td>
                      <td class="num">{{ fmt(r.total) }}</td>
                      <td class="num"><span class="tm-badge" :class="r.total && r.dmarcPass / r.total > 0.98 ? 'ok' : 'warn'">{{ pct(r.total ? r.dmarcPass / r.total : null) }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="data.dmarc.failingSources.length">
                <span class="tm-label">{{ t("deliv.failing_sources") }}</span>
                <p class="tm-hint"><span v-for="s in data.dmarc.failingSources" :key="s.ip" class="tm-badge warn" style="margin: 4px 4px 0 0">{{ s.ip }} · {{ s.count }}</span></p>
              </div>
            </template>
            <p class="tm-hint">{{ t("deliv.dmarc_hint") }}</p>
          </section>
        </div>

        <!-- Placement tests -->
        <section class="tm-card">
          <h3 class="tm-card-title"><span class="tm-title-left"><MailWarning :size="14" /> {{ t("deliv.placement") }}</span></h3>
          <p class="tm-hint">
            {{ data.seeds.length ? t("deliv.placement_seeds", { n: data.seeds.length }) : t("deliv.placement_no_seeds") }}
            <NuxtLink to="/settings?tab=deliverability">{{ t("deliv.configure") }}</NuxtLink>
          </p>
          <div v-if="tests.length" class="tm-table-wrap">
            <table class="tm-table">
              <thead><tr><th>{{ t("deliv.campaign") }}</th><th>{{ t("deliv.date") }}</th><th>{{ t("deliv.results") }}</th></tr></thead>
              <tbody>
                <tr v-for="tt in tests" :key="tt.id">
                  <td><NuxtLink :to="`/campaigns/${tt.campaignId}`">{{ tt.campaignName || `#${tt.campaignId}` }}</NuxtLink></td>
                  <td class="tm-muted">{{ fmtDate(tt.createdAt) }}</td>
                  <td>
                    <span v-for="r in tt.results" :key="r.seed" class="tm-badge" :class="PLACEMENT_CLASS[r.placement]" style="margin: 2px 4px 2px 0" :title="r.seed + (r.detail ? ' — ' + r.detail : '')">
                      {{ r.provider }}: {{ t(`deliv.pl_${r.placement}`) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Suppression list -->
        <section class="tm-card">
          <h3 class="tm-card-title">
            <span class="tm-title-left"><Ban :size="14" /> {{ t("deliv.suppression") }} <span class="tm-badge">{{ fmt(sup.total) }}</span></span>
            <button class="tm-btn tm-btn-sm" @click="showAdd = true"><Plus :size="12" /> {{ t("deliv.sup_add") }}</button>
          </h3>
          <p class="tm-hint">{{ t("deliv.suppression_hint") }}</p>
          <div class="tm-row">
            <div class="tm-field" style="position: relative">
              <input v-model="sup.q" class="tm-input" type="search" :placeholder="t('deliv.sup_search')" />
            </div>
            <div class="tm-field" style="flex: 0 0 200px">
              <select v-model="sup.reason" class="tm-select">
                <option value="">{{ t("deliv.all_reasons") }}</option>
                <option v-for="r in ['unsubscribed', 'bounced', 'complained', 'invalid', 'manual']" :key="r" :value="r">{{ t(`deliv.reason_${r}`) }}</option>
              </select>
            </div>
          </div>
          <div class="tm-table-wrap">
            <div v-if="!sup.rows.length" class="tm-empty">{{ sup.loading ? t("common.loading") : t("deliv.sup_empty") }}</div>
            <table v-else class="tm-table">
              <thead><tr><th>{{ t("deliv.address") }}</th><th>{{ t("deliv.reason") }}</th><th>{{ t("deliv.detail") }}</th><th>{{ t("deliv.date") }}</th><th></th></tr></thead>
              <tbody>
                <tr v-for="r in sup.rows" :key="r.id">
                  <td class="tm-mono">{{ r.emailHint || "—" }}</td>
                  <td><span class="tm-badge" :class="r.reason === 'complained' || r.reason === 'bounced' ? 'bad' : r.reason === 'invalid' ? 'warn' : 'info'">{{ t(`deliv.reason_${r.reason}`) }}</span></td>
                  <td class="tm-muted" style="max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap" :title="r.detail">{{ r.detail || r.source || "—" }}</td>
                  <td class="tm-muted">{{ fmtDate(r.createdAt) }}</td>
                  <td class="num"><button class="tm-btn tm-btn-sm tm-btn-ghost" @click="removeSup(r)" :title="t('deliv.sup_remove_title')"><Trash2 :size="13" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="sup.total > SUP_LIMIT" class="tm-actions" style="justify-content: flex-end">
            <button class="tm-btn tm-btn-sm" :disabled="sup.offset === 0" @click="sup.offset = Math.max(0, sup.offset - SUP_LIMIT); loadSup()">‹</button>
            <span class="tm-muted" style="font-size: 12px">{{ sup.offset + 1 }}–{{ Math.min(sup.total, sup.offset + SUP_LIMIT) }} / {{ sup.total }}</span>
            <button class="tm-btn tm-btn-sm" :disabled="sup.offset + SUP_LIMIT >= sup.total" @click="sup.offset += SUP_LIMIT; loadSup()">›</button>
          </div>
        </section>

        <!-- Warm-up -->
        <section class="tm-card">
          <h3 class="tm-card-title"><span class="tm-title-left"><Flame :size="14" /> {{ t("deliv.warmup") }}</span></h3>
          <p class="tm-hint" v-if="data.warmup.enabled && data.warmup.capToday">
            {{ t("deliv.warmup_on", { sent: fmt(data.warmup.sentToday), cap: fmt(data.warmup.capToday) }) }}
          </p>
          <p class="tm-hint" v-else-if="data.warmup.enabled">{{ t("deliv.warmup_done") }}</p>
          <p class="tm-hint" v-else>
            {{ t("deliv.warmup_off", { sent: fmt(data.warmup.sentToday) }) }}
            <NuxtLink to="/settings?tab=sending">{{ t("deliv.configure") }}</NuxtLink>
          </p>
        </section>
      </template>
    </main>

    <Teleport to="body">
      <div v-if="showAdd" class="tm-modal-backdrop" @click.self="showAdd = false">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head">
            <h2>{{ t("deliv.sup_add") }}</h2>
            <button class="tm-btn tm-btn-ghost tm-icon-btn" @click="showAdd = false"><X :size="16" /></button>
          </div>
          <div class="tm-modal-body">
            <div class="tm-field">
              <label>{{ t("deliv.sup_add_emails") }}</label>
              <textarea v-model="addText" class="tm-textarea" rows="6" placeholder="ana@example.com, luis@example.com"></textarea>
            </div>
            <div class="tm-field">
              <label>{{ t("deliv.sup_add_note") }}</label>
              <input v-model="addNote" class="tm-input" :placeholder="t('deliv.sup_add_note_ph')" />
            </div>
          </div>
          <div class="tm-modal-foot">
            <button class="tm-btn" @click="showAdd = false">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="!addText.trim()" @click="addSuppressions">{{ t("deliv.sup_add") }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
