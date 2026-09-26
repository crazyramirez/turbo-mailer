<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  X, CheckCircle2, AlertTriangle, XCircle, Info, Send, Loader2, ShieldCheck, ChevronDown, Clock, Sparkles,
} from "lucide-vue-next";
const { t, te } = useI18n();

const props = defineProps<{ campaignId: number | string }>();
const emit = defineEmits<{ confirm: []; close: [] }>();

type Status = "pass" | "warn" | "fail" | "info";
interface PrecheckItem {
  id: string;
  group: "content" | "audience" | "auth" | "infra";
  status: Status;
  data?: Record<string, any>;
}
interface PrecheckResult {
  items: PrecheckItem[];
  blocked: boolean;
  warnings: number;
  active: number;
  score: number | null;
  etaMinutes: number;
}

const loading = ref(true);
const error = ref("");
const result = ref<PrecheckResult | null>(null);
const expanded = ref<Set<string>>(new Set());

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  try {
    // live=1 also HTTP-checks links and runs the spam filter when configured
    result.value = await $fetch<PrecheckResult>(`/api/campaigns/${props.campaignId}/precheck?live=1`);
    // Open details of anything that needs attention
    for (const i of result.value.items) {
      if ((i.status === "fail" || i.status === "warn") && hasDetails(i)) expanded.value.add(i.id);
    }
  } catch (e: any) {
    error.value = e.data?.statusMessage || e.message;
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => window.removeEventListener("keydown", onKeydown));

const ORDER: Record<Status, number> = { fail: 0, warn: 1, info: 2, pass: 3 };
const GROUPS = ["content", "audience", "auth", "infra"] as const;

const grouped = computed(() => {
  if (!result.value) return [];
  return GROUPS.map((g) => ({
    group: g,
    items: result.value!.items.filter((i) => i.group === g).sort((a, b) => ORDER[a.status] - ORDER[b.status]),
  })).filter((g) => g.items.length);
});

function groupStatus(items: PrecheckItem[]): Status {
  return items.reduce<Status>((worst, i) => (ORDER[i.status] < ORDER[worst] ? i.status : worst), "pass");
}

function itemLabel(item: PrecheckItem): string {
  const key = `precheck.items.${item.id}.${item.status}`;
  return te(key) ? t(key, item.data || {}) : item.id;
}

function hasDetails(item: PrecheckItem): boolean {
  const d = item.data;
  return !!d && ((Array.isArray(d.findings) && d.findings.length > 0) || (Array.isArray(d.issues) && d.issues.length > 0) || (Array.isArray(d.symbols) && d.symbols.length > 0));
}

function toggle(id: string) {
  const s = new Set(expanded.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expanded.value = s;
}

function findingLabel(f: { id: string; data?: Record<string, any> }): string {
  const key = `precheck.findings.${f.id}`;
  return te(key) ? t(key, f.data || {}) : f.id;
}
function compatLabel(i: { id: string; clients: string[]; count: number }): string {
  const key = `precheck.compat.${i.id}`;
  const base = te(key) ? t(key) : i.id;
  return `${base} — ${i.clients.join(", ")}${i.count > 1 ? ` (×${i.count})` : ""}`;
}

const scoreLevel = computed(() => {
  const s = result.value?.score;
  if (s === null || s === undefined) return null;
  return s >= 5 ? "risky" : s >= 2 ? "review" : "good";
});
const scorePct = computed(() => Math.min(100, ((result.value?.score ?? 0) / 10) * 100));

// Optional second opinion: an AI editor reads the email like a recipient
// would (tone, clarity, promises, broken personalisation, legal footer).
interface AiReview { verdict: string; issues: { severity: "high" | "medium" | "low"; category: string; problem: string; fix: string }[] }
const aiAvailable = ref(false);
const aiReview = ref<AiReview | null>(null);
const aiLoading = ref(false);
const aiError = ref("");
onMounted(async () => {
  const st = await $fetch<{ configured: boolean }>("/api/ai/status").catch(() => null);
  aiAvailable.value = !!st?.configured;
});
async function runAiReview() {
  aiLoading.value = true;
  aiError.value = "";
  try {
    aiReview.value = await $fetch<AiReview>("/api/ai/review", { method: "POST", body: { campaignId: Number(props.campaignId) } });
  } catch (e: any) {
    aiError.value = e?.data?.statusMessage || e.message;
  } finally {
    aiLoading.value = false;
  }
}
</script>

<template>
  <div class="modal-overlay glass-modal" @click.self="emit('close')">
    <div class="pc-window" role="dialog" aria-modal="true" :aria-label="t('precheck.title')">
      <div class="pc-header">
        <div class="pc-title">
          <ShieldCheck :size="20" class="pc-title-icon" />
          <div>
            <h2>{{ t("precheck.title") }}</h2>
            <p>{{ t("precheck.subtitle") }}</p>
          </div>
        </div>
        <button @click="emit('close')" class="btn-close" :aria-label="t('common.close')"><X :size="18" /></button>
      </div>

      <div class="pc-body">
        <div v-if="loading" class="pc-state">
          <Loader2 :size="20" class="spin" />
          <span>{{ t("precheck.running") }}</span>
        </div>
        <div v-else-if="error" class="pc-state pc-error">{{ error }}</div>
        <template v-else-if="result">
          <div v-if="scoreLevel" class="pc-score" :class="`lvl-${scoreLevel}`">
            <div class="pc-score-head">
              <span>{{ t("precheck.score_title") }}</span>
              <strong>{{ result.score }} / 10</strong>
            </div>
            <div class="pc-score-bar"><span :style="{ width: `${scorePct}%` }"></span></div>
            <p>{{ t(`precheck.score_${scoreLevel}`) }}</p>
          </div>

          <section v-if="aiAvailable" class="pc-ai">
            <div class="pc-ai-head">
              <span><Sparkles :size="14" /> {{ t("precheck.ai_title") }}</span>
              <button v-if="!aiReview" class="pc-ai-btn" :disabled="aiLoading" @click="runAiReview">
                <Loader2 v-if="aiLoading" :size="12" class="spin" /> {{ aiLoading ? t("precheck.ai_running") : t("precheck.ai_run") }}
              </button>
            </div>
            <p v-if="aiError" class="pc-ai-err">{{ aiError }}</p>
            <template v-if="aiReview">
              <p class="pc-ai-verdict">{{ aiReview.verdict }}</p>
              <ul v-if="aiReview.issues.length" class="pc-ai-list">
                <li v-for="(i, n) in aiReview.issues" :key="n" :class="`sev-${i.severity}`">
                  <span class="pc-ai-sev">{{ t(`precheck.ai_sev.${i.severity}`) }}</span>
                  <div><strong>{{ i.problem }}</strong><span class="pc-ai-fix">→ {{ i.fix }}</span></div>
                </li>
              </ul>
              <p v-else class="pc-ai-verdict ok">{{ t("precheck.ai_clean") }}</p>
            </template>
          </section>

          <section v-for="g in grouped" :key="g.group" class="pc-group">
            <h3 class="pc-group-title" :class="`st-${groupStatus(g.items)}`">
              {{ t(`precheck.groups.${g.group}`) }}
            </h3>
            <ul class="pc-list">
              <li v-for="item in g.items" :key="item.id" class="pc-item" :class="`pc-${item.status}`">
                <div class="pc-row" :class="{ clickable: hasDetails(item) }" @click="hasDetails(item) && toggle(item.id)">
                  <CheckCircle2 v-if="item.status === 'pass'" :size="16" class="pc-ico pass" />
                  <AlertTriangle v-else-if="item.status === 'warn'" :size="16" class="pc-ico warn" />
                  <Info v-else-if="item.status === 'info'" :size="16" class="pc-ico info" />
                  <XCircle v-else :size="16" class="pc-ico fail" />
                  <span class="pc-text">{{ itemLabel(item) }}</span>
                  <ChevronDown v-if="hasDetails(item)" :size="14" class="pc-chev" :class="{ open: expanded.has(item.id) }" />
                </div>
                <ul v-if="hasDetails(item) && expanded.has(item.id)" class="pc-details">
                  <li v-for="f in item.data?.findings || []" :key="f.id + (f.data?.phrase || '')">
                    <span class="pc-weight">+{{ f.weight }}</span> {{ findingLabel(f) }}
                  </li>
                  <li v-for="c in item.data?.issues || []" :key="c.id" :class="`sev-${c.severity}`">
                    {{ compatLabel(c) }}
                  </li>
                  <li v-for="s in item.data?.symbols || []" :key="s.name">
                    <span class="pc-weight">+{{ s.score }}</span> <code>{{ s.name }}</code>
                    <span v-if="s.description" class="pc-sym-desc"> — {{ s.description }}</span>
                  </li>
                </ul>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <div class="pc-footer" v-if="result && !loading">
        <div class="pc-verdicts">
          <span v-if="result.blocked" class="pc-verdict fail">{{ t("precheck.blocked") }}</span>
          <span v-else-if="result.warnings" class="pc-verdict warn">{{ t("precheck.warnings", { count: result.warnings }) }}</span>
          <span v-else class="pc-verdict pass">{{ t("precheck.all_good") }}</span>
          <span v-if="result.active && result.etaMinutes" class="pc-eta">
            <Clock :size="12" /> {{ t("precheck.eta", { minutes: result.etaMinutes }) }}
          </span>
        </div>

        <div class="pc-actions">
          <button class="btn-cancel" @click="emit('close')">
            {{ t("common.cancel") }}
          </button>
          <button class="btn-send-now" :disabled="result.blocked" @click="emit('confirm')">
            <Send :size="14" />
            {{ t("precheck.send_now", { count: result.active }) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pc-window {
  max-width: 640px;
  width: 95%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 16px;
  overflow: hidden;
}
.pc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-hi);
}
.pc-title {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.pc-title-icon {
  color: var(--accent, #6366f1);
  margin-top: 2px;
}
.pc-title h2 {
  font-size: 1rem;
  margin: 0 0 2px;
}
.pc-title p {
  font-size: 0.78rem;
  color: var(--text-dim, #8b8fa3);
  margin: 0;
}
.btn-close {
  background: none;
  border: none;
  color: var(--text-dim, #8b8fa3);
  cursor: pointer;
  padding: 4px;
}
.pc-body {
  padding: 14px 20px;
  overflow-y: auto;
  flex: 1;
}
.pc-state {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  padding: 30px 0;
  color: var(--text-dim, #8b8fa3);
  font-size: 0.85rem;
}
.pc-error {
  color: #f87171;
}
.pc-score {
  border: 1px solid var(--border-hi);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: rgba(255, 255, 255, 0.02);
}
.pc-score-head {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-dim, #c9cbe0);
}
.pc-score-bar {
  height: 6px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.06);
  margin: 8px 0;
  overflow: hidden;
}
.pc-score-bar span {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.4s ease;
}
.lvl-good .pc-score-bar span { background: #34d399; }
.lvl-review .pc-score-bar span { background: #fbbf24; }
.lvl-risky .pc-score-bar span { background: #f87171; }
.pc-score p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-dim, #8b8fa3);
}
.pc-group + .pc-group {
  margin-top: 14px;
}
.pc-group-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 8px;
  color: var(--text-dim, #8b8fa3);
  display: flex;
  align-items: center;
  gap: 6px;
}
.pc-group-title::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
}
.pc-group-title.st-warn::before { background: #fbbf24; }
.pc-group-title.st-fail::before { background: #f87171; }
.pc-group-title.st-info::before { background: #60a5fa; }
.pc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pc-item {
  font-size: 0.83rem;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.pc-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.pc-row.clickable {
  cursor: pointer;
}
.pc-text {
  flex: 1;
}
.pc-item.pc-fail { background: rgba(248, 113, 113, 0.07); }
.pc-item.pc-warn { background: rgba(251, 191, 36, 0.06); }
.pc-item.pc-info { background: rgba(96, 165, 250, 0.05); }
.pc-ico {
  flex-shrink: 0;
  margin-top: 1px;
}
.pc-ico.pass { color: #34d399; }
.pc-ico.warn { color: #fbbf24; }
.pc-ico.fail { color: #f87171; }
.pc-ico.info { color: #60a5fa; }
.pc-chev {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--text-dim, #8b8fa3);
  transition: transform 0.2s;
}
.pc-chev.open { transform: rotate(180deg); }
.pc-details {
  list-style: none;
  margin: 8px 0 2px 26px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.76rem;
  color: var(--text-dim, #c9cbe0);
}
.pc-details .sev-info { opacity: 0.75; }
.pc-weight {
  display: inline-block;
  min-width: 34px;
  font-variant-numeric: tabular-nums;
  color: #fbbf24;
  font-weight: 600;
}
.pc-details code {
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 5px;
  border-radius: 4px;
}
.pc-sym-desc { opacity: 0.7; }
.pc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-hi);
  flex-wrap: wrap;
}
.pc-verdicts {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pc-verdict {
  font-size: 0.78rem;
  font-weight: 600;
}
.pc-verdict.pass { color: #34d399; }
.pc-verdict.warn { color: #fbbf24; }
.pc-verdict.fail { color: #f87171; }
.pc-eta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--text-dim, #8b8fa3);
}
.pc-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.btn-cancel {
  background: none;
  border: 1px solid var(--border-hi);
  color: var(--text-dim, #c9cbe0);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-send-now {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--accent, #6366f1);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-send-now:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.pc-ai {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(129, 140, 248, 0.25);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.04));
}
.pc-ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  font-weight: 700;
}
.pc-ai-head > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pc-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(129, 140, 248, 0.45);
  background: rgba(99, 102, 241, 0.18);
  color: #e0e7ff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.pc-ai-btn:disabled {
  opacity: 0.7;
  cursor: default;
}
.pc-ai-err {
  margin: 8px 0 0;
  font-size: 12px;
  color: #f87171;
}
.pc-ai-verdict {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
}
.pc-ai-verdict.ok {
  color: #34d399;
}
.pc-ai-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pc-ai-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  line-height: 1.45;
}
.pc-ai-list li > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pc-ai-fix {
  opacity: 0.75;
}
.pc-ai-sev {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(96, 165, 250, 0.15);
  color: #93c5fd;
}
.sev-high .pc-ai-sev {
  background: rgba(248, 113, 113, 0.15);
  color: #fca5a5;
}
.sev-medium .pc-ai-sev {
  background: rgba(251, 191, 36, 0.15);
  color: #fcd34d;
}
</style>
