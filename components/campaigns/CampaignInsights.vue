<script setup lang="ts">
import { Sparkles, Loader2, RefreshCcw, Inbox, ThumbsUp, AlertTriangle, Lightbulb, Rocket, MailCheck } from "lucide-vue-next";

// Sent-campaign intelligence: AI analysis of the real numbers + inbox
// placement tests against the configured seed mailboxes.
const props = defineProps<{ campaignId: number; status: string; sentCount: number; initialInsights?: any }>();
const { t, locale } = useI18n();
const { showToast } = useDashboardState();
const { can } = useMe();

// ── AI insights ─────────────────────────────────────────────────────
interface Insights { summary: string; wins: string[]; problems: string[]; recommendations: string[]; nextCampaignIdea: string; generatedAt: string }
const insights = ref<Insights | null>((props.initialInsights as Insights) ?? null);
const loadingInsights = ref(false);
const insightsError = ref("");
async function analyze(refresh = false) {
  loadingInsights.value = true;
  insightsError.value = "";
  try {
    insights.value = await $fetch<Insights>("/api/ai/insights", { method: "POST", body: { campaignId: props.campaignId, refresh, language: locale.value } });
  } catch (e: any) {
    insightsError.value = e?.data?.statusMessage || e.message;
  } finally {
    loadingInsights.value = false;
  }
}

// ── Inbox placement ────────────────────────────────────────────────
interface PlacementTest { id: number; status: string; results: { seed: string; provider: string; placement: string; folder?: string; detail?: string }[]; createdAt: string }
const tests = ref<PlacementTest[]>([]);
const starting = ref(false);
let poll: ReturnType<typeof setInterval> | null = null;

async function loadTests() {
  tests.value = await $fetch<PlacementTest[]>("/api/placement-tests", { query: { campaignId: props.campaignId } }).catch(() => []);
  const running = tests.value.some((x) => x.status === "running");
  if (running && !poll) poll = setInterval(loadTests, 10_000);
  if (!running && poll) {
    clearInterval(poll);
    poll = null;
  }
}
async function startTest() {
  starting.value = true;
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/placement-test`, { method: "POST" });
    showToast(t("insights.placement_started"), "success");
    await loadTests();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    starting.value = false;
  }
}
const latest = computed(() => tests.value[0] ?? null);
const inboxRate = computed(() => {
  const r = latest.value?.results.filter((x) => x.placement !== "pending" && x.placement !== "error") ?? [];
  return r.length ? Math.round((r.filter((x) => x.placement === "inbox").length / r.length) * 100) : null;
});

// The cached analysis comes with the campaign; a new one (paid AI call) only on demand
onMounted(loadTests);
onUnmounted(() => poll && clearInterval(poll));

const PLACEMENT_CLASS: Record<string, string> = { inbox: "ok", promotions: "warn", spam: "bad", missing: "bad", error: "", pending: "info" };
</script>

<template>
  <div class="ins-grid">
    <section class="ins-card ai">
      <div class="ins-head">
        <span><Sparkles :size="15" /> {{ t("insights.title") }}</span>
        <button v-if="insights && can('editor')" class="ins-btn ghost" :disabled="loadingInsights" :title="t('insights.refresh')" @click="analyze(true)"><RefreshCcw :size="13" /></button>
      </div>
      <div v-if="loadingInsights" class="ins-loading"><Loader2 :size="16" class="tm-spin" /> {{ t("insights.analyzing") }}</div>
      <template v-else-if="insights">
        <p class="ins-summary">{{ insights.summary }}</p>
        <div v-if="insights.wins.length" class="ins-block ok"><h4><ThumbsUp :size="13" /> {{ t("insights.wins") }}</h4><ul><li v-for="(w, i) in insights.wins" :key="i">{{ w }}</li></ul></div>
        <div v-if="insights.problems.length" class="ins-block bad"><h4><AlertTriangle :size="13" /> {{ t("insights.problems") }}</h4><ul><li v-for="(w, i) in insights.problems" :key="i">{{ w }}</li></ul></div>
        <div v-if="insights.recommendations.length" class="ins-block info"><h4><Lightbulb :size="13" /> {{ t("insights.recommendations") }}</h4><ul><li v-for="(w, i) in insights.recommendations" :key="i">{{ w }}</li></ul></div>
        <div v-if="insights.nextCampaignIdea" class="ins-next"><Rocket :size="14" /><div><strong>{{ t("insights.next") }}</strong> {{ insights.nextCampaignIdea }}</div></div>
      </template>
      <template v-else>
        <p class="ins-muted">{{ insightsError || t("insights.empty") }}</p>
        <button v-if="sentCount > 0 && can('editor')" class="ins-btn primary" @click="analyze(true)"><Sparkles :size="13" /> {{ t("insights.analyze") }}</button>
      </template>
    </section>

    <section class="ins-card">
      <div class="ins-head">
        <span><Inbox :size="15" /> {{ t("insights.placement") }}</span>
        <button v-if="can('editor')" class="ins-btn" :disabled="starting || latest?.status === 'running'" @click="startTest">
          <Loader2 v-if="starting || latest?.status === 'running'" :size="13" class="tm-spin" /><MailCheck v-else :size="13" /> {{ t("insights.run_test") }}
        </button>
      </div>
      <p class="ins-muted">{{ t("insights.placement_hint") }}</p>
      <template v-if="latest">
        <div class="pl-rate" v-if="inboxRate !== null">
          <span class="pl-num" :class="inboxRate >= 80 ? 'ok' : inboxRate >= 50 ? 'warn' : 'bad'">{{ inboxRate }}%</span>
          <span>{{ t("insights.inbox_rate") }}</span>
        </div>
        <ul class="pl-list">
          <li v-for="r in latest.results" :key="r.seed">
            <span class="pl-provider">{{ r.provider }}</span>
            <span class="pl-seed">{{ r.seed }}</span>
            <span class="tm-badge" :class="PLACEMENT_CLASS[r.placement]" :title="r.detail || r.folder || ''">{{ t(`insights.pl.${r.placement}`) }}</span>
          </li>
        </ul>
        <p class="ins-muted small">{{ new Date(latest.createdAt).toLocaleString() }}</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.ins-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 14px;
  margin: 18px 0;
}
.ins-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.025);
}
.ins-card.ai {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.04));
  border-color: rgba(129, 140, 248, 0.22);
}
.ins-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}
.ins-head > span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.ins-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.ins-btn.primary {
  align-self: flex-start;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-color: transparent;
}
.ins-btn.ghost {
  padding: 5px 8px;
}
.ins-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.ins-loading {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}
.ins-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
}
.ins-block h4 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  font-size: 12px;
}
.ins-block.ok h4 {
  color: #34d399;
}
.ins-block.bad h4 {
  color: #fb7185;
}
.ins-block.info h4 {
  color: #a5b4fc;
}
.ins-block ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.85);
}
.ins-next {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}
.ins-muted {
  margin: 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.5;
}
.ins-muted.small {
  font-size: 11px;
}
.pl-rate {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.pl-num {
  font-size: 30px;
  font-weight: 800;
}
.pl-num.ok {
  color: #34d399;
}
.pl-num.warn {
  color: #fbbf24;
}
.pl-num.bad {
  color: #fb7185;
}
.pl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pl-list li {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 12.5px;
}
.pl-provider {
  font-weight: 700;
}
.pl-seed {
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 900px) {
  .ins-grid {
    grid-template-columns: 1fr;
  }
}
</style>
