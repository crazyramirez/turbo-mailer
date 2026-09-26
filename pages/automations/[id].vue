<script setup lang="ts">
import { Workflow, ArrowLeft, Save, Play, Pause, UserPlus, Zap, Loader2, X, AlertTriangle } from "lucide-vue-next";
import StepList from "~/components/automations/StepList.vue";
import StepEditor from "~/components/automations/StepEditor.vue";
import type { AutoStepUI } from "~/utils/automation-types";
import { findParentList } from "~/utils/automation-types";
import type { SegMeta } from "~/utils/segment-types";

definePageMeta({ layout: "app" });
const { t } = useI18n();
const route = useRoute();
const { showToast } = useDashboardState();
const { can, me, refresh: refreshMe } = useMe();
const id = computed(() => Number(route.params.id));

interface Automation {
  id: number;
  name: string;
  status: "draft" | "active" | "paused";
  trigger: Record<string, any>;
  steps: AutoStepUI[];
  allowReentry: boolean;
  runs: Record<string, number>;
  stats: Record<string, { sent: number; opens: number; clicks: number; skipped: number }>;
  recentRuns: any[];
}

const auto = ref<Automation | null>(null);
const selected = ref<AutoStepUI | "trigger" | null>("trigger");
const saving = ref(false);
const dirty = ref(false);
const errorMsg = ref("");

// Reference data for pickers
const lists = ref<{ id: number; name: string }[]>([]);
const forms = ref<{ id: number; name: string }[]>([]);
const campaigns = ref<{ id: number; name: string }[]>([]);
const templates = ref<{ name: string }[]>([]);
const customFields = ref<{ key: string; label: string; type: string }[]>([]);
const segMeta = ref<SegMeta | null>(null);
const segments = ref<{ id: number; name: string; count: number | null }[]>([]);
const brand = ref<any>(null);

// Condition branches must be real arrays so the flow can insert into them
function normalize(list: AutoStepUI[]) {
  for (const s of list) {
    if (s.type === "condition") {
      s.yes ??= [];
      s.no ??= [];
      normalize(s.yes);
      normalize(s.no);
    }
  }
}

async function load() {
  const a = await $fetch<Automation>(`/api/automations/${id.value}`);
  normalize(a.steps);
  auto.value = a;
  await nextTick();
  dirty.value = false;
}

onMounted(async () => {
  if (!me.value) refreshMe();
  await load();
  const [l, f, m, tp, cf, sg, b] = await Promise.all([
    $fetch<any[]>("/api/lists").catch(() => []),
    $fetch<any[]>("/api/audience/forms").catch(() => []),
    $fetch<SegMeta>("/api/segments/meta").catch(() => null),
    $fetch<any[]>("/api/templates").catch(() => []),
    $fetch<any[]>("/api/custom-fields").catch(() => []),
    $fetch<any[]>("/api/segments", { query: { counts: "0" } }).catch(() => []),
    $fetch<any>("/api/brand-kit").catch(() => null),
  ]);
  lists.value = l;
  forms.value = f;
  segMeta.value = m;
  campaigns.value = m?.campaigns ?? [];
  templates.value = tp;
  customFields.value = cf;
  segments.value = sg;
  brand.value = b;
});

watch(
  () => auto.value && JSON.stringify([auto.value.name, auto.value.trigger, auto.value.steps, auto.value.allowReentry]),
  (v, old) => {
    if (old) dirty.value = true;
  },
);

async function save(status?: Automation["status"]) {
  if (!auto.value) return;
  saving.value = true;
  errorMsg.value = "";
  try {
    const r = await $fetch<{ status: string }>(`/api/automations/${auto.value.id}`, {
      method: "PUT",
      body: { name: auto.value.name, trigger: auto.value.trigger, steps: auto.value.steps, allowReentry: auto.value.allowReentry, status: status ?? auto.value.status },
    });
    const keepSel = selected.value && selected.value !== "trigger" ? selected.value.id : null;
    await load();
    if (keepSel && auto.value) selected.value = findParentList(auto.value.steps, keepSel)?.list.find((s) => s.id === keepSel) ?? "trigger";
    showToast(status === "active" ? t("automations.activated") : status === "paused" ? t("automations.paused") : t("automations.saved"), "success");
    return r;
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage || e.message;
    showToast(errorMsg.value, "error");
  } finally {
    saving.value = false;
  }
}

function removeSelected() {
  if (!auto.value || !selected.value || selected.value === "trigger") return;
  const p = findParentList(auto.value.steps, selected.value.id);
  if (p) p.list.splice(p.index, 1);
  selected.value = "trigger";
}
function moveSelected(dir: -1 | 1) {
  if (!auto.value || !selected.value || selected.value === "trigger") return;
  const p = findParentList(auto.value.steps, selected.value.id);
  if (!p) return;
  const j = p.index + dir;
  if (j < 0 || j >= p.list.length) return;
  [p.list[p.index], p.list[j]] = [p.list[j], p.list[p.index]];
}

// ── Trigger ──────────────────────────────────────────────────────────
const TRIGGERS = ["subscribed", "list_added", "tag_added", "form_submitted", "email_opened", "link_clicked", "api_event", "date", "manual"];
function setTriggerType(type: string) {
  if (!auto.value) return;
  const base: Record<string, any> = { type };
  if (type === "list_added") base.listId = lists.value[0]?.id ?? null;
  if (type === "api_event") base.event = "order.completed";
  if (type === "date") Object.assign(base, { field: "created_at", offsetDays: 0 });
  auto.value.trigger = base;
}
const dateFields = computed(() => customFields.value.filter((f) => f.type === "date"));

function triggerSummary(tr: Record<string, any>): string {
  const name = (arr: { id: number; name: string }[], id: number | null | undefined) => arr.find((x) => x.id === id)?.name;
  switch (tr.type) {
    case "subscribed": return tr.listId ? t("automations.trig_sum.subscribed_list", { list: name(lists.value, tr.listId) ?? "…" }) : t("automations.trig_sum.subscribed");
    case "list_added": return t("automations.trig_sum.list_added", { list: name(lists.value, tr.listId) ?? "…" });
    case "tag_added": return t("automations.trig_sum.tag_added", { tag: tr.tag || "…" });
    case "form_submitted": return tr.formId ? t("automations.trig_sum.form", { form: name(forms.value, tr.formId) ?? "…" }) : t("automations.trig_sum.any_form");
    case "email_opened": return tr.campaignId ? t("automations.trig_sum.opened", { c: name(campaigns.value, tr.campaignId) ?? "…" }) : t("automations.trig_sum.opened_any");
    case "link_clicked": return tr.urlContains ? t("automations.trig_sum.clicked_url", { url: tr.urlContains }) : t("automations.trig_sum.clicked_any");
    case "api_event": return t("automations.trig_sum.api_event", { event: tr.event || "…" });
    case "date": {
      const f = tr.field === "created_at" ? t("audience.fields.created_at") : dateFields.value.find((x) => x.key === tr.field)?.label ?? tr.field;
      return t("automations.trig_sum.date", { field: f, offset: tr.offsetDays ? ` (${tr.offsetDays > 0 ? "+" : ""}${tr.offsetDays}d)` : "" });
    }
    case "manual": return t("automations.trig_sum.manual");
  }
  return "";
}

// ── Enroll existing contacts ────────────────────────────────────────
const enroll = ref<{ mode: "email" | "list" | "segment"; email: string; listId: number | null; segmentId: number | null } | null>(null);
const enrolling = ref(false);
async function doEnroll() {
  if (!enroll.value || !auto.value) return;
  enrolling.value = true;
  try {
    const e = enroll.value;
    const body = e.mode === "email" ? { email: e.email } : e.mode === "list" ? { listId: e.listId } : { segmentId: e.segmentId };
    const r = await $fetch<{ requested: number; enrolled: number }>(`/api/automations/${auto.value.id}/enroll`, { method: "POST", body });
    showToast(t("automations.enrolled", { n: r.enrolled, total: r.requested }), "success");
    enroll.value = null;
    await load();
  } catch (err: any) {
    showToast(err?.data?.statusMessage || err.message, "error");
  } finally {
    enrolling.value = false;
  }
}

const readonly = computed(() => !can("editor"));
const selStep = computed(() => (selected.value && selected.value !== "trigger" ? selected.value : null));
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm(t("automations.unsaved"))) return false;
});
</script>

<template>
  <div class="tm-page">
    <main v-if="auto" class="tm-main">
      <div class="tm-header">
        <div class="tm-header-left">
          <NuxtLink to="/automations" class="tm-btn tm-btn-ghost tm-icon-btn"><ArrowLeft :size="18" /></NuxtLink>
          <Workflow :size="28" class="tm-header-icon" />
          <div class="name-wrap">
            <input v-model="auto.name" class="name-input" :disabled="readonly" maxlength="120" />
            <div class="status-line">
              <span class="tm-badge" :class="auto.status === 'active' ? 'ok' : auto.status === 'paused' ? 'warn' : ''">{{ t(`automations.status.${auto.status}`) }}</span>
              <span class="tm-muted">{{ t("automations.runs_summary", { active: auto.runs.active + auto.runs.waiting, done: auto.runs.done, total: auto.runs.total }) }}</span>
              <span v-if="dirty" class="tm-badge warn">{{ t("automations.unsaved_badge") }}</span>
            </div>
          </div>
        </div>
        <div v-if="!readonly" class="tm-actions">
          <button v-if="auto.status === 'active'" class="tm-btn" @click="enroll = { mode: 'email', email: '', listId: lists[0]?.id ?? null, segmentId: segments[0]?.id ?? null }"><UserPlus :size="14" /> {{ t("automations.enroll") }}</button>
          <button class="tm-btn" :disabled="saving" @click="save()"><Save :size="14" /> {{ t("common.save") }}</button>
          <button v-if="auto.status !== 'active'" class="tm-btn tm-btn-primary" :disabled="saving" @click="save('active')"><Play :size="14" /> {{ t("automations.activate") }}</button>
          <button v-else class="tm-btn" :disabled="saving" @click="save('paused')"><Pause :size="14" /> {{ t("automations.pause") }}</button>
        </div>
      </div>

      <div v-if="errorMsg" class="err-banner"><AlertTriangle :size="14" /> {{ errorMsg }}</div>

      <div class="builder">
        <section class="canvas">
          <div class="trigger-node" :class="{ sel: selected === 'trigger' }" role="button" tabindex="0" @click="selected = 'trigger'">
            <span class="trig-icon"><Zap :size="15" /></span>
            <div class="node-body">
              <span class="node-type">{{ t("automations.trigger") }}</span>
              <span class="node-summary">{{ triggerSummary(auto.trigger) }}</span>
            </div>
          </div>
          <StepList :steps="auto.steps" :selected-id="selStep?.id ?? null" :stats="auto.stats" :readonly="readonly" @select="(s) => (selected = s)" />
          <div class="end-node">{{ t("automations.end") }}</div>
        </section>

        <aside class="tm-card panel">
          <template v-if="selected === 'trigger'">
            <h3 class="tm-card-title">{{ t("automations.trigger") }}</h3>
            <fieldset :disabled="readonly" class="plain">
              <div class="tm-field"><label>{{ t("automations.trigger_when") }}</label>
                <select :value="auto.trigger.type" class="tm-select" @change="setTriggerType(($event.target as HTMLSelectElement).value)">
                  <option v-for="tr in TRIGGERS" :key="tr" :value="tr">{{ t(`automations.triggers.${tr}`) }}</option>
                </select>
              </div>
              <div v-if="auto.trigger.type === 'subscribed' || auto.trigger.type === 'list_added'" class="tm-field">
                <label>{{ t("automations.list") }}</label>
                <select v-model="auto.trigger.listId" class="tm-select">
                  <option v-if="auto.trigger.type === 'subscribed'" :value="null">{{ t("automations.any_list") }}</option>
                  <option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }}</option>
                </select>
              </div>
              <div v-if="auto.trigger.type === 'tag_added'" class="tm-field"><label>{{ t("automations.tag") }}</label>
                <input v-model="auto.trigger.tag" class="tm-input" list="trig-tags" /><datalist id="trig-tags"><option v-for="tg in segMeta?.tags ?? []" :key="tg.tag" :value="tg.tag" /></datalist></div>
              <div v-if="auto.trigger.type === 'form_submitted'" class="tm-field"><label>{{ t("automations.form") }}</label>
                <select v-model="auto.trigger.formId" class="tm-select"><option :value="null">{{ t("automations.any_form") }}</option><option v-for="f in forms" :key="f.id" :value="f.id">{{ f.name }}</option></select></div>
              <template v-if="auto.trigger.type === 'email_opened' || auto.trigger.type === 'link_clicked'">
                <div class="tm-field"><label>{{ t("automations.campaign") }}</label>
                  <select v-model="auto.trigger.campaignId" class="tm-select"><option :value="null">{{ t("automations.any_campaign") }}</option><option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option></select></div>
                <div v-if="auto.trigger.type === 'link_clicked'" class="tm-field"><label>{{ t("automations.url_contains") }}</label><input v-model="auto.trigger.urlContains" class="tm-input" placeholder="/precios" /></div>
              </template>
              <template v-if="auto.trigger.type === 'api_event'">
                <div class="tm-field"><label>{{ t("automations.event_name") }}</label><input v-model="auto.trigger.event" class="tm-input tm-mono" placeholder="order.completed" /></div>
                <p class="tm-hint">{{ t("automations.event_hint") }}</p>
                <pre class="tm-pre">POST /api/v1/events
{ "email": "ana@…", "event": "{{ auto.trigger.event || 'order.completed' }}" }</pre>
              </template>
              <template v-if="auto.trigger.type === 'date'">
                <div class="tm-field"><label>{{ t("automations.date_field") }}</label>
                  <select v-model="auto.trigger.field" class="tm-select">
                    <option value="created_at">{{ t("audience.fields.created_at") }}</option>
                    <option v-for="f in dateFields" :key="f.key" :value="f.key">{{ f.label }}</option>
                  </select></div>
                <div class="tm-field"><label>{{ t("automations.offset_days") }}</label><input v-model.number="auto.trigger.offsetDays" type="number" min="-60" max="60" class="tm-input" />
                  <p class="tm-hint">{{ t("automations.offset_hint") }}</p></div>
              </template>
              <p v-if="auto.trigger.type === 'manual'" class="tm-hint">{{ t("automations.manual_hint") }}</p>
              <label class="tm-check"><input v-model="auto.allowReentry" type="checkbox" /> {{ t("automations.reentry") }}</label>
              <p class="tm-hint">{{ t("automations.reentry_hint") }}</p>
            </fieldset>
          </template>
          <StepEditor v-else-if="selStep" :key="selStep.id" :step="selStep" :lists="lists" :custom-fields="customFields" :templates="templates" :seg-meta="segMeta" :brand="brand"
            :stats="auto.stats[selStep.id]" :readonly="readonly" @remove="removeSelected" @move="moveSelected" />
        </aside>
      </div>

      <section class="tm-card">
        <h3 class="tm-card-title">{{ t("automations.recent_runs") }}</h3>
        <div v-if="!auto.recentRuns.length" class="tm-empty">{{ t("automations.no_runs") }}</div>
        <div v-else class="tm-table-wrap">
          <table class="tm-table">
            <thead><tr><th>{{ t("automations.contact") }}</th><th>{{ t("automations.run_status") }}</th><th>{{ t("automations.started") }}</th><th>{{ t("automations.next") }}</th></tr></thead>
            <tbody>
              <tr v-for="r in auto.recentRuns" :key="r.id">
                <td>{{ r.email || "—" }}</td>
                <td><span class="tm-badge" :class="{ ok: r.status === 'done', bad: r.status === 'failed', info: r.status === 'waiting' || r.status === 'active' }">{{ t(`automations.run.${r.status}`) }}</span>
                  <div v-if="r.lastError" class="tm-muted" style="font-size: 11px; color: #fb7185">{{ r.lastError }}</div></td>
                <td class="tm-muted">{{ fmtDate(r.startedAt) }}</td>
                <td class="tm-muted">{{ r.status === "waiting" ? fmtDate(r.nextRunAt) : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
    <div v-else class="tm-loading" style="padding: 80px"><Loader2 :size="20" class="tm-spin" /></div>

    <Teleport to="body">
      <div v-if="enroll" class="tm-modal-backdrop" @click.self="enroll = null">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head"><h2>{{ t("automations.enroll") }}</h2><button class="tm-btn tm-btn-ghost tm-icon-btn" @click="enroll = null"><X :size="16" /></button></div>
          <div class="tm-modal-body">
            <div class="tm-tabs" role="tablist">
              <button v-for="m in (['email', 'list', 'segment'] as const)" :key="m" class="tm-tab" :class="{ active: enroll.mode === m }" @click="enroll.mode = m">{{ t(`automations.enroll_${m}`) }}</button>
            </div>
            <div v-if="enroll.mode === 'email'" class="tm-field"><label>Email</label><input v-model="enroll.email" type="email" class="tm-input" /></div>
            <div v-else-if="enroll.mode === 'list'" class="tm-field"><label>{{ t("automations.list") }}</label>
              <select v-model="enroll.listId" class="tm-select"><option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }}</option></select></div>
            <div v-else class="tm-field"><label>{{ t("automations.segment") }}</label>
              <select v-model="enroll.segmentId" class="tm-select"><option v-for="s in segments" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
            <p class="tm-hint">{{ t("automations.enroll_hint") }}</p>
          </div>
          <div class="tm-modal-foot">
            <button class="tm-btn" @click="enroll = null">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="enrolling" @click="doEnroll"><Loader2 v-if="enrolling" :size="13" class="tm-spin" /> {{ t("automations.enroll") }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.name-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.name-input {
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text);
  font-size: 22px;
  font-weight: 800;
  padding: 2px 6px;
  margin-left: -6px;
  min-width: 0;
  width: min(520px, 60vw);
}
.name-input:hover,
.name-input:focus {
  border-color: var(--border);
  outline: none;
}
.status-line {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  flex-wrap: wrap;
}
.err-banner {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12.5px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.3);
  color: #fb7185;
}
.builder {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  align-items: start;
}
.canvas {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 12px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 18px 18px;
  min-height: 420px;
  overflow-x: auto;
}
.trigger-node {
  width: min(100%, 340px);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(129, 140, 248, 0.45);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(236, 72, 153, 0.1));
  cursor: pointer;
}
.trigger-node.sel {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
  border-color: rgba(129, 140, 248, 0.9);
}
.trig-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.4);
  color: #fff;
}
.node-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.node-type {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.node-summary {
  font-size: 13px;
  font-weight: 600;
}
.end-node {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.panel {
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}
.plain {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
@media (max-width: 980px) {
  .builder {
    grid-template-columns: 1fr;
  }
  .panel {
    position: static;
    max-height: none;
  }
}
</style>
