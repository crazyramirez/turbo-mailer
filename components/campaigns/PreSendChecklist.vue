<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  X, CheckCircle2, AlertTriangle, XCircle, Info, Send, Loader2, ShieldCheck, ChevronDown, Clock, Sparkles, Wrench, Undo2, Check,
} from "lucide-vue-next";
const { t, te } = useI18n();

const props = defineProps<{ campaignId: number | string }>();
// updated: the campaign content changed here (repair / AI fixes / undo)
const emit = defineEmits<{ confirm: []; close: []; updated: [] }>();

type Status = "pass" | "warn" | "fail" | "info";
interface PrecheckItem {
  id: string;
  group: "content" | "audience" | "auth" | "infra";
  status: Status;
  data?: Record<string, any>;
}
interface RepairChange { id: string; count: number }
interface PrecheckResult {
  items: PrecheckItem[];
  blocked: boolean;
  warnings: number;
  active: number;
  score: number | null;
  etaMinutes: number;
  repairable?: RepairChange[];
  editable?: boolean;
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

// After a content change: re-check without the slow live probes (links,
// spam filter) and keep their last results — repairs don't change links.
const LIVE_ITEMS = new Set(["links_live", "spam_engine", "spam_engine_unreachable"]);
const refreshing = ref(false);
async function refreshPrecheck() {
  refreshing.value = true;
  try {
    const next = await $fetch<PrecheckResult>(`/api/campaigns/${props.campaignId}/precheck`);
    const kept = (result.value?.items ?? []).filter((i) => LIVE_ITEMS.has(i.id) && !next.items.some((n) => n.id === i.id));
    next.items = [...next.items, ...kept];
    next.warnings = next.items.filter((i) => i.status === "warn").length;
    next.blocked = next.items.some((i) => i.status === "fail");
    result.value = next;
  } catch {
    // The previous result stays on screen
  } finally {
    refreshing.value = false;
  }
}

// Everything changed from this dialog can be undone in one go: the snapshot
// keeps the values from before the FIRST change.
const undoSnapshot = ref<Record<string, unknown> | null>(null);
const actionError = ref("");
const notice = ref("");
async function afterChange(previous: Record<string, unknown> | null) {
  if (!previous) return;
  undoSnapshot.value = { ...previous, ...(undoSnapshot.value ?? {}) };
  notice.value = "";
  emit("updated");
  await refreshPrecheck();
}
function errorText(e: any): string {
  return e?.data?.statusMessage || e?.message || String(e);
}

const repairing = ref(false);
const repairDone = ref<RepairChange[] | null>(null);
async function runRepair() {
  repairing.value = true;
  actionError.value = "";
  try {
    const r = await $fetch<{ changes: RepairChange[]; previous: Record<string, unknown> | null }>(
      `/api/campaigns/${props.campaignId}/repair`, { method: "POST" });
    repairDone.value = r.changes;
    await afterChange(r.previous);
  } catch (e: any) {
    actionError.value = errorText(e);
  } finally {
    repairing.value = false;
  }
}
function repairLabel(c: RepairChange): string {
  const key = `precheck.repair.items.${c.id}`;
  return te(key) ? t(key, { count: c.count }) : c.id;
}

const undoing = ref(false);
async function undoChanges() {
  if (!undoSnapshot.value) return;
  undoing.value = true;
  actionError.value = "";
  try {
    await $fetch(`/api/campaigns/${props.campaignId}`, { method: "PUT", body: undoSnapshot.value });
    undoSnapshot.value = null;
    repairDone.value = null;
    aiState.value = {};
    notice.value = t("precheck.undone");
    emit("updated");
    await refreshPrecheck();
  } catch (e: any) {
    actionError.value = errorText(e);
  } finally {
    undoing.value = false;
  }
}

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
interface AiEdit { target: "subject" | "subjectB" | "preheader" | "body" | "none"; find: string; replace: string; occurrence: number }
interface AiReview { verdict: string; issues: { severity: "high" | "medium" | "low"; category: string; problem: string; fix: string; edit?: AiEdit }[] }
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
    aiState.value = {};
  } catch (e: any) {
    aiError.value = e?.data?.statusMessage || e.message;
  } finally {
    aiLoading.value = false;
  }
}

// One-click AI fixes: each issue's edit is a find → replace on the subject,
// preheader or visible text; the server reports which ones matched.
const aiState = ref<Record<number, "applied" | "failed">>({});
const applying = ref(false);
function canApply(n: number): boolean {
  const e = aiReview.value?.issues[n]?.edit;
  return !!e && e.target !== "none" && !!e.find && result.value?.editable !== false;
}
const pendingEdits = computed(() =>
  (aiReview.value?.issues ?? []).map((_, n) => n).filter((n) => canApply(n) && !aiState.value[n]));
async function applyAiEdits(indices: number[]) {
  if (!indices.length || !aiReview.value) return;
  applying.value = true;
  actionError.value = "";
  try {
    const edits = indices.map((n) => aiReview.value!.issues[n].edit!);
    const r = await $fetch<{ applied: number[]; failed: number[]; previous: Record<string, unknown> | null }>(
      `/api/campaigns/${props.campaignId}/apply-edits`, { method: "POST", body: { edits } });
    const next = { ...aiState.value };
    for (const k of r.applied) next[indices[k]] = "applied";
    for (const k of r.failed) next[indices[k]] = "failed";
    aiState.value = next;
    await afterChange(r.previous);
  } catch (e: any) {
    actionError.value = errorText(e);
  } finally {
    applying.value = false;
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

          <div v-if="undoSnapshot || notice || actionError" class="pc-undo" :class="{ err: actionError }">
            <span v-if="actionError">{{ actionError }}</span>
            <span v-else-if="undoSnapshot"><Check :size="13" /> {{ t("precheck.changes_saved") }}</span>
            <span v-else>{{ notice }}</span>
            <Loader2 v-if="refreshing" :size="12" class="spin" />
            <button v-if="undoSnapshot" class="pc-link-btn" :disabled="undoing || repairing || applying" @click="undoChanges">
              <Undo2 :size="12" /> {{ t("precheck.undo") }}
            </button>
          </div>

          <section v-if="result.editable !== false && (result.repairable?.length || repairDone)" class="pc-ai pc-repair">
            <div class="pc-ai-head">
              <span><Wrench :size="14" /> {{ t("precheck.repair.title") }}</span>
              <button v-if="result.repairable?.length" class="pc-ai-btn" :disabled="repairing || applying" @click="runRepair">
                <Loader2 v-if="repairing" :size="12" class="spin" /> {{ repairing ? t("precheck.repair.running") : t("precheck.repair.run") }}
              </button>
            </div>
            <template v-if="repairDone && !result.repairable?.length">
              <p class="pc-ai-verdict ok">{{ repairDone.length ? t("precheck.repair.done") : t("precheck.repair.nothing") }}</p>
              <ul v-if="repairDone.length" class="pc-repair-list">
                <li v-for="c in repairDone" :key="c.id"><Check :size="12" /> {{ repairLabel(c) }}</li>
              </ul>
            </template>
            <template v-else>
              <p class="pc-ai-verdict">{{ t("precheck.repair.hint") }}</p>
              <ul class="pc-repair-list">
                <li v-for="c in result.repairable" :key="c.id">{{ repairLabel(c) }}</li>
              </ul>
            </template>
          </section>

          <section v-if="aiAvailable" class="pc-ai">
            <div class="pc-ai-head">
              <span><Sparkles :size="14" /> {{ t("precheck.ai_title") }}</span>
              <button v-if="!aiReview" class="pc-ai-btn" :disabled="aiLoading" @click="runAiReview">
                <Loader2 v-if="aiLoading" :size="12" class="spin" /> {{ aiLoading ? t("precheck.ai_running") : t("precheck.ai_run") }}
              </button>
              <button v-else-if="pendingEdits.length > 1" class="pc-ai-btn" :disabled="applying || repairing" @click="applyAiEdits(pendingEdits)">
                <Loader2 v-if="applying" :size="12" class="spin" /> {{ applying ? t("precheck.ai_applying") : t("precheck.ai_apply_all", { count: pendingEdits.length }) }}
              </button>
            </div>
            <p v-if="aiError" class="pc-ai-err">{{ aiError }}</p>
            <template v-if="aiReview">
              <p class="pc-ai-verdict">{{ aiReview.verdict }}</p>
              <ul v-if="aiReview.issues.length" class="pc-ai-list">
                <li v-for="(i, n) in aiReview.issues" :key="n" :class="[`sev-${i.severity}`, { done: aiState[n] === 'applied' }]">
                  <span class="pc-ai-sev">{{ t(`precheck.ai_sev.${i.severity}`) }}</span>
                  <div>
                    <strong>{{ i.problem }}</strong><span class="pc-ai-fix">→ {{ i.fix }}</span>
                    <span v-if="aiState[n] === 'applied'" class="pc-ai-state ok"><Check :size="12" /> {{ t("precheck.ai_applied") }}</span>
                    <span v-else-if="aiState[n] === 'failed'" class="pc-ai-state miss">{{ t("precheck.ai_not_found") }}</span>
                    <button v-else-if="canApply(n)" class="pc-ai-apply" :disabled="applying || repairing" @click="applyAiEdits([n])">
                      {{ t("precheck.ai_apply") }}
                    </button>
                    <span v-else class="pc-ai-state">{{ t("precheck.ai_manual") }}</span>
                  </div>
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
.pc-ai-list li.done > div {
  opacity: 0.6;
}
.pc-ai-apply {
  align-self: flex-start;
  margin-top: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(129, 140, 248, 0.45);
  background: rgba(99, 102, 241, 0.14);
  color: #e0e7ff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.pc-ai-apply:disabled {
  opacity: 0.6;
  cursor: default;
}
.pc-ai-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.7;
}
.pc-ai-state.ok {
  color: #34d399;
  opacity: 1;
}
.pc-ai-state.miss {
  color: #fbbf24;
  opacity: 1;
}
.pc-repair {
  border-color: rgba(52, 211, 153, 0.3);
  background: linear-gradient(135deg, rgba(52, 211, 153, 0.07), rgba(96, 165, 250, 0.04));
}
.pc-repair-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-dim, #c9cbe0);
}
.pc-repair-list li {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.pc-repair-list li :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
  color: #34d399;
}
.pc-undo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  background: rgba(52, 211, 153, 0.08);
  color: #a7f3d0;
}
.pc-undo > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}
.pc-undo.err {
  background: rgba(248, 113, 113, 0.08);
  color: #fca5a5;
}
.pc-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
.pc-link-btn:disabled {
  opacity: 0.5;
  cursor: default;
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
