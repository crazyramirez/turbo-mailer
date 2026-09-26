<script setup lang="ts">
import { Filter, Plus, Pencil, Trash2, Sparkles, Loader2, Users, ArrowLeft, Send } from "lucide-vue-next";
import SegmentGroupEditor from "~/components/audience/SegmentGroupEditor.vue";
import type { SegGroup, SegMeta } from "~/utils/segment-types";

const { t } = useI18n();
const { showToast, showDialog } = useDashboardState();
const { can } = useMe();

const segments = ref<any[]>([]);
const meta = ref<SegMeta | null>(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const [s, m] = await Promise.all([$fetch<any[]>("/api/segments"), $fetch<SegMeta>("/api/segments/meta")]);
    segments.value = s;
    meta.value = m;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ── Editor ─────────────────────────────────────────────────────────────
interface Draft { id: number | null; name: string; description: string; rules: SegGroup }
const draft = ref<Draft | null>(null);
const preview = ref<{ ok: boolean; count?: number; total?: number; sample?: any[]; error?: string } | null>(null);
const previewing = ref(false);
const saving = ref(false);

const PRESETS: { id: string; rules: SegGroup }[] = [
  { id: "engaged_30", rules: { match: "all", rules: [{ field: "behavior", op: "engaged_within_days", value: 30 }] } },
  { id: "never_engaged", rules: { match: "all", rules: [{ field: "last_engaged_at", op: "empty" }, { field: "sent_since_engaged", op: "gte", value: 3 }] } },
  { id: "at_risk", rules: { match: "all", rules: [{ field: "behavior", op: "not_engaged_within_days", value: 90 }, { field: "behavior", op: "engaged_within_days", value: 365 }] } },
  { id: "new_30", rules: { match: "all", rules: [{ field: "created_at", op: "within_days", value: 30 }] } },
  { id: "top_fans", rules: { match: "all", rules: [{ field: "engagement_score", op: "gte", value: 70 }] } },
  { id: "gmail", rules: { match: "any", rules: [{ field: "email_domain", op: "eq", value: "gmail.com" }, { field: "email_domain", op: "eq", value: "googlemail.com" }] } },
];

function openNew(preset?: SegGroup, name = "") {
  draft.value = { id: null, name, description: "", rules: structuredClone(toRaw(preset)) ?? { match: "all", rules: [{ field: "behavior", op: "engaged_within_days", value: 30 }] } };
  aiExplanation.value = "";
}
function openEdit(s: any) {
  draft.value = { id: s.id, name: s.name, description: s.description ?? "", rules: structuredClone(toRaw(s.rules)) };
  aiExplanation.value = "";
}

let timer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => draft.value && JSON.stringify(draft.value.rules),
  (v) => {
    if (!v) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(runPreview, 450);
  },
);
async function runPreview() {
  if (!draft.value) return;
  previewing.value = true;
  try {
    preview.value = await $fetch<any>("/api/segments/preview", { method: "POST", body: { rules: draft.value.rules } });
  } catch (e: any) {
    preview.value = { ok: false, error: e?.data?.statusMessage || e.message };
  } finally {
    previewing.value = false;
  }
}

async function saveDraft() {
  if (!draft.value) return;
  saving.value = true;
  try {
    const body = { name: draft.value.name, description: draft.value.description, rules: draft.value.rules };
    if (draft.value.id) await $fetch(`/api/segments/${draft.value.id}`, { method: "PUT", body });
    else await $fetch("/api/segments", { method: "POST", body });
    showToast(t("audience.seg.saved"), "success");
    draft.value = null;
    preview.value = null;
    await load();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    saving.value = false;
  }
}

async function remove(s: any) {
  if (!(await showDialog({ type: "confirm", title: t("audience.seg.delete_title"), message: s.name }))) return;
  try {
    await $fetch(`/api/segments/${s.id}`, { method: "DELETE" });
    await load();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}

// ── AI: natural language → rules ───────────────────────────────────────
const aiPrompt = ref("");
const aiBusy = ref(false);
const aiExplanation = ref("");
async function askAi() {
  if (aiPrompt.value.trim().length < 4) return;
  aiBusy.value = true;
  try {
    const r = await $fetch<any>("/api/ai/segment", { method: "POST", body: { prompt: aiPrompt.value } });
    openNew(r.rules, r.name);
    aiExplanation.value = r.explanation;
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    aiBusy.value = false;
  }
}

const fmt = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat().format(n));
</script>

<template>
  <div v-if="loading && !meta" class="tm-loading"><Loader2 :size="18" class="tm-spin" /></div>

  <!-- Editor -->
  <div v-else-if="draft && meta" class="seg-editor">
    <div class="tm-card">
      <h3 class="tm-card-title">
        <span class="tm-title-left"><button class="tm-btn tm-btn-sm tm-btn-ghost" @click="draft = null; preview = null"><ArrowLeft :size="13" /></button>
          {{ draft.id ? t("audience.seg.edit") : t("audience.seg.new") }}</span>
      </h3>
      <div v-if="aiExplanation" class="ai-note"><Sparkles :size="13" /> {{ aiExplanation }}</div>
      <div class="tm-row">
        <div class="tm-field" style="flex: 1 1 240px"><label>{{ t("audience.seg.name") }}</label><input v-model="draft.name" class="tm-input" :placeholder="t('audience.seg.name_ph')" /></div>
        <div class="tm-field" style="flex: 2 1 300px"><label>{{ t("audience.seg.description") }}</label><input v-model="draft.description" class="tm-input" /></div>
      </div>
      <SegmentGroupEditor :group="draft.rules" :meta="meta" />
    </div>

    <aside class="tm-card seg-preview">
      <h3 class="tm-card-title"><span class="tm-title-left"><Users :size="14" /> {{ t("audience.seg.preview") }}</span>
        <Loader2 v-if="previewing" :size="13" class="tm-spin" /></h3>
      <template v-if="preview?.ok">
        <div class="seg-count">{{ fmt(preview.count) }}</div>
        <p class="tm-hint">{{ t("audience.seg.count_hint", { total: fmt(preview.total) }) }}</p>
        <ul class="seg-sample">
          <li v-for="c in preview.sample" :key="c.id"><strong>{{ c.name || c.email }}</strong><span v-if="c.name">{{ c.email }}</span></li>
        </ul>
      </template>
      <p v-else-if="preview?.error" class="tm-hint" style="color: #fb7185">{{ preview.error }}</p>
      <div class="tm-actions">
        <button class="tm-btn tm-btn-primary" :disabled="saving || !draft.name.trim() || !preview?.ok || !can('editor')" @click="saveDraft">{{ t("common.save") }}</button>
      </div>
    </aside>
  </div>

  <!-- List -->
  <div v-else class="tm-main" style="padding: 0">
    <section class="tm-card ai-card">
      <h3 class="tm-card-title"><span class="tm-title-left"><Sparkles :size="14" /> {{ t("audience.seg.ai_title") }}</span></h3>
      <div class="tm-row" style="align-items: flex-end">
        <div class="tm-field" style="flex: 1 1 320px">
          <input v-model="aiPrompt" class="tm-input" :placeholder="t('audience.seg.ai_ph')" :disabled="aiBusy" @keydown.enter="askAi" />
        </div>
        <button class="tm-btn tm-btn-primary" :disabled="aiBusy || aiPrompt.trim().length < 4 || !can('editor')" @click="askAi">
          <Loader2 v-if="aiBusy" :size="13" class="tm-spin" /><Sparkles v-else :size="13" /> {{ t("audience.seg.ai_go") }}
        </button>
      </div>
      <div class="presets">
        <span class="tm-muted">{{ t("audience.seg.presets") }}</span>
        <button v-for="p in PRESETS" :key="p.id" class="tm-btn tm-btn-sm tm-btn-ghost" :disabled="!can('editor')" @click="openNew(p.rules, t(`audience.seg.preset_${p.id}`))">{{ t(`audience.seg.preset_${p.id}`) }}</button>
      </div>
    </section>

    <section class="tm-card">
      <h3 class="tm-card-title">
        <span class="tm-title-left"><Filter :size="14" /> {{ t("audience.seg.title") }}</span>
        <button v-if="can('editor')" class="tm-btn tm-btn-sm" @click="openNew()"><Plus :size="12" /> {{ t("audience.seg.new") }}</button>
      </h3>
      <div v-if="!segments.length" class="tm-empty">{{ t("audience.seg.empty") }}</div>
      <div v-else class="seg-grid">
        <article v-for="s in segments" :key="s.id" class="seg-card">
          <div class="seg-card-head">
            <strong>{{ s.name }}</strong>
            <span class="seg-card-count">{{ fmt(s.count) }}</span>
          </div>
          <p v-if="s.description" class="tm-hint">{{ s.description }}</p>
          <div class="seg-card-actions">
            <NuxtLink v-if="can('editor')" :to="`/campaigns/new?segment=${s.id}`" class="tm-btn tm-btn-sm"><Send :size="12" /> {{ t("audience.seg.campaign") }}</NuxtLink>
            <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.edit')" @click="openEdit(s)"><Pencil :size="13" /></button>
            <button v-if="can('editor')" class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.delete')" @click="remove(s)"><Trash2 :size="13" /></button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.seg-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}
.seg-preview {
  position: sticky;
  top: 80px;
}
.seg-count {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
}
.seg-sample {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  font-size: 12.5px;
}
.seg-sample li {
  display: flex;
  flex-direction: column;
}
.seg-sample span {
  color: var(--text-muted);
  font-size: 11.5px;
}
.ai-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(129, 140, 248, 0.25);
}
.ai-card {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.05));
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}
.seg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.seg-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seg-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.seg-card-count {
  font-size: 20px;
  font-weight: 800;
}
.seg-card-actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
}
@media (max-width: 900px) {
  .seg-editor {
    grid-template-columns: 1fr;
  }
  .seg-preview {
    position: static;
  }
}
</style>
