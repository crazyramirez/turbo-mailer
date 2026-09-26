<script setup lang="ts">
import { Trash2, ArrowUp, ArrowDown, Sparkles, Loader2, FileText, Eye } from "lucide-vue-next";
import SegmentGroupEditor from "~/components/audience/SegmentGroupEditor.vue";
import { streamAiCampaign, assembleAiResult } from "~/composables/useAiCampaign";
import type { AutoStepUI } from "~/utils/automation-types";
import type { SegMeta } from "~/utils/segment-types";

const props = defineProps<{
  step: AutoStepUI;
  lists: { id: number; name: string }[];
  customFields: { key: string; label: string; type: string }[];
  templates: { name: string }[];
  segMeta: SegMeta | null;
  brand: any;
  stats?: { sent: number; opens: number; clicks: number; skipped: number };
  readonly?: boolean;
}>();
const emit = defineEmits<{ remove: []; move: [dir: -1 | 1] }>();
const { t, locale } = useI18n();
const { showToast } = useDashboardState();

const s = computed(() => props.step);
const WEEKDAYS = computed(() => [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: new Date(2024, 0, 7 + d).toLocaleDateString(locale.value, { weekday: "short" }) })));

function toggleDay(d: number) {
  const w = new Set(s.value.weekdays ?? []);
  if (w.has(d)) w.delete(d);
  else w.add(d);
  s.value.weekdays = [...w].sort();
}

const condKind = computed({
  get: () => s.value.condition?.kind ?? "opened_last",
  set: (k: string) => {
    s.value.condition = k === "segment" ? { kind: "segment", rules: { match: "all", rules: [{ field: "behavior", op: "engaged_within_days", value: 30 }] } } : ({ kind: k } as any);
  },
});

// ── Email content ────────────────────────────────────────────────────
const loadingTpl = ref(false);
async function loadTemplate(name: string) {
  if (!name) return;
  loadingTpl.value = true;
  try {
    const r = await $fetch<{ content: string }>("/api/templates", { query: { name } });
    s.value.templateHtml = r.content;
    s.value.templateName = name;
  } catch (e: any) {
    showToast(e?.data?.message || e.message, "error");
  } finally {
    loadingTpl.value = false;
  }
}

const aiBrief = ref("");
const aiBusy = ref(false);
const aiProgress = ref(0);
async function generateWithAi() {
  if (aiBrief.value.trim().length < 5) return;
  aiBusy.value = true;
  aiProgress.value = 0;
  try {
    const lang = props.brand?.language || (locale.value === "en" ? "en" : "es");
    const result = await streamAiCampaign(
      { brief: aiBrief.value, goal: "nurture", language: lang, useBrandKit: true },
      (chars) => (aiProgress.value = Math.min(95, Math.round((chars / 9000) * 100))),
    );
    s.value.templateHtml = await assembleAiResult(result, { brand: props.brand, language: lang });
    s.value.subject = result.campaign.subject;
    s.value.preheader = result.campaign.preheader;
    s.value.templateName = undefined;
    showToast(t("automations.email.ai_done"), "success");
  } catch (e: any) {
    showToast(e?.message || String(e), "error");
  } finally {
    aiBusy.value = false;
  }
}

const showPreview = ref(false);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
</script>

<template>
  <div class="step-editor">
    <div class="se-head">
      <strong>{{ t(`automations.types.${s.type}`) }}</strong>
      <div v-if="!readonly" class="se-actions">
        <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('automations.move_up')" @click="emit('move', -1)"><ArrowUp :size="13" /></button>
        <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('automations.move_down')" @click="emit('move', 1)"><ArrowDown :size="13" /></button>
        <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.delete')" @click="emit('remove')"><Trash2 :size="13" /></button>
      </div>
    </div>

    <fieldset :disabled="readonly" class="se-body">
      <!-- Email -->
      <template v-if="s.type === 'email'">
        <div v-if="stats" class="se-stats">
          <div><span>{{ stats.sent }}</span>{{ t("automations.email.sent") }}</div>
          <div><span>{{ pct(stats.opens, stats.sent) }}</span>{{ t("automations.email.opens") }}</div>
          <div><span>{{ pct(stats.clicks, stats.sent) }}</span>{{ t("automations.email.clicks") }}</div>
          <div><span>{{ stats.skipped }}</span>{{ t("automations.email.skipped") }}</div>
        </div>
        <div class="tm-field"><label>{{ t("automations.email.subject") }}</label><input v-model="s.subject" class="tm-input" maxlength="255" /></div>
        <div class="tm-field"><label>{{ t("automations.email.preheader") }}</label><input v-model="s.preheader" class="tm-input" maxlength="255" /></div>

        <span class="tm-label">{{ t("automations.email.content") }}</span>
        <div class="se-content-status">
          <FileText :size="14" />
          <span v-if="s.templateHtml">{{ s.templateName ? t("automations.email.from_template", { name: s.templateName }) : t("automations.email.custom_content") }}</span>
          <span v-else class="warn">{{ t("automations.email.no_content") }}</span>
          <button v-if="s.templateHtml" class="tm-btn tm-btn-sm tm-btn-ghost" @click="showPreview = true"><Eye :size="12" /> {{ t("automations.email.preview") }}</button>
        </div>
        <div class="tm-row" style="align-items: flex-end">
          <div class="tm-field">
            <label>{{ t("automations.email.use_template") }}</label>
            <select class="tm-select" :value="''" :disabled="loadingTpl" @change="(e) => loadTemplate((e.target as HTMLSelectElement).value)">
              <option value="">—</option>
              <option v-for="tp in templates" :key="tp.name" :value="tp.name">{{ tp.name }}</option>
            </select>
          </div>
        </div>
        <div class="se-ai">
          <label class="tm-label"><Sparkles :size="12" /> {{ t("automations.email.ai_title") }}</label>
          <textarea v-model="aiBrief" class="tm-textarea" rows="3" :placeholder="t('automations.email.ai_ph')" :disabled="aiBusy"></textarea>
          <div class="tm-actions">
            <span v-if="aiBusy" class="tm-muted" style="font-size: 12px">{{ aiProgress }}%</span>
            <button class="tm-btn tm-btn-sm tm-btn-primary" :disabled="aiBusy || aiBrief.trim().length < 5" @click="generateWithAi">
              <Loader2 v-if="aiBusy" :size="12" class="tm-spin" /><Sparkles v-else :size="12" /> {{ t("automations.email.ai_go") }}
            </button>
          </div>
        </div>
      </template>

      <!-- Wait -->
      <div v-else-if="s.type === 'wait'" class="tm-row">
        <div class="tm-field"><label>{{ t("automations.wait.amount") }}</label><input v-model.number="s.amount" type="number" min="1" max="365" class="tm-input" /></div>
        <div class="tm-field"><label>{{ t("automations.wait.unit") }}</label>
          <select v-model="s.unit" class="tm-select"><option v-for="u in ['minutes', 'hours', 'days']" :key="u" :value="u">{{ t(`automations.units.${u}`) }}</option></select>
        </div>
      </div>

      <!-- Wait until -->
      <template v-else-if="s.type === 'wait_until'">
        <span class="tm-label">{{ t("automations.wait_until.days") }}</span>
        <div class="days">
          <button v-for="w in WEEKDAYS" :key="w.d" class="day" :class="{ on: s.weekdays?.includes(w.d) }" @click="toggleDay(w.d)">{{ w.label }}</button>
        </div>
        <p class="tm-hint">{{ t("automations.wait_until.days_hint") }}</p>
        <div class="tm-field"><label>{{ t("automations.wait_until.hour") }}</label>
          <select v-model.number="s.hour" class="tm-select"><option v-for="h in 24" :key="h" :value="h - 1">{{ String(h - 1).padStart(2, "0") }}:00</option></select>
        </div>
      </template>

      <!-- Condition -->
      <template v-else-if="s.type === 'condition'">
        <div class="tm-field"><label>{{ t("automations.cond.label") }}</label>
          <select v-model="condKind" class="tm-select">
            <option value="opened_last">{{ t("automations.cond.opened_last") }}</option>
            <option value="clicked_last">{{ t("automations.cond.clicked_last") }}</option>
            <option value="segment">{{ t("automations.cond.segment") }}</option>
          </select>
        </div>
        <p class="tm-hint">{{ t("automations.cond.hint") }}</p>
        <SegmentGroupEditor v-if="s.condition?.kind === 'segment' && segMeta" :group="(s.condition as any).rules" :meta="segMeta" />
      </template>

      <!-- Tag -->
      <template v-else-if="s.type === 'tag'">
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("automations.action") }}</label>
            <select v-model="s.action" class="tm-select"><option value="add">{{ t("automations.add") }}</option><option value="remove">{{ t("automations.remove") }}</option></select>
          </div>
          <div class="tm-field"><label>{{ t("automations.tag") }}</label><input v-model="s.tag" class="tm-input" maxlength="50" list="auto-tags" /></div>
        </div>
        <datalist id="auto-tags"><option v-for="tg in segMeta?.tags ?? []" :key="tg.tag" :value="tg.tag" /></datalist>
      </template>

      <!-- List -->
      <div v-else-if="s.type === 'list'" class="tm-row">
        <div class="tm-field"><label>{{ t("automations.action") }}</label>
          <select v-model="s.action" class="tm-select"><option value="add">{{ t("automations.add") }}</option><option value="remove">{{ t("automations.remove") }}</option></select>
        </div>
        <div class="tm-field"><label>{{ t("automations.list") }}</label>
          <select v-model.number="s.listId" class="tm-select"><option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }}</option></select>
        </div>
      </div>

      <!-- Field -->
      <template v-else-if="s.type === 'field'">
        <div class="tm-field"><label>{{ t("automations.field.key") }}</label>
          <select v-model="s.key" class="tm-select">
            <option v-for="k in ['name', 'company', 'role', 'phone']" :key="k" :value="k">{{ t(`audience.fields.${k}`) }}</option>
            <option v-for="f in customFields" :key="f.key" :value="`custom.${f.key}`">{{ f.label }}</option>
          </select>
        </div>
        <div class="tm-field"><label>{{ t("automations.field.value") }}</label><input v-model="s.value" class="tm-input" :placeholder="t('automations.field.value_ph')" /></div>
      </template>

      <!-- Webhook -->
      <template v-else-if="s.type === 'webhook'">
        <div class="tm-field"><label>URL (https)</label><input v-model="s.url" class="tm-input" placeholder="https://tu-app.com/hooks/turbomailer" /></div>
        <p class="tm-hint">{{ t("automations.webhook_hint") }}</p>
      </template>

      <p v-else-if="s.type === 'exit'" class="tm-hint">{{ t("automations.exit_hint") }}</p>
    </fieldset>

    <Teleport to="body">
      <div v-if="showPreview" class="tm-modal-backdrop" @click.self="showPreview = false">
        <div class="tm-modal preview-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head"><h2>{{ s.subject }}</h2><button class="tm-btn tm-btn-ghost tm-icon-btn" @click="showPreview = false">✕</button></div>
          <iframe class="preview-frame" sandbox="" :srcdoc="s.templateHtml" title="preview"></iframe>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.step-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.se-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.se-actions {
  display: flex;
  gap: 2px;
}
.se-body {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.se-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.se-stats div {
  display: flex;
  flex-direction: column;
  font-size: 10.5px;
  color: var(--text-muted);
  padding: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
}
.se-stats span {
  font-size: 16px;
  font-weight: 800;
  color: var(--text);
}
.se-content-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.se-content-status .warn {
  color: #fbbf24;
}
.se-ai {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.07);
  border: 1px solid rgba(129, 140, 248, 0.22);
}
.se-ai .tm-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.days {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.day {
  padding: 5px 9px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  text-transform: capitalize;
}
.day.on {
  background: rgba(99, 102, 241, 0.25);
  color: #fff;
  border-color: rgba(129, 140, 248, 0.6);
}
.preview-modal {
  width: min(760px, 96vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
}
.preview-frame {
  width: 100%;
  height: 75vh;
  border: none;
  background: #fff;
  border-radius: 0 0 16px 16px;
}
</style>
