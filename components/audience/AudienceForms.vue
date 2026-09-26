<script setup lang="ts">
import { FileInput, Plus, Pencil, Trash2, Copy, ExternalLink, ArrowLeft, ArrowUp, ArrowDown, X, Loader2 } from "lucide-vue-next";

const { t } = useI18n();
const { showToast, showDialog } = useDashboardState();
const { can } = useMe();

interface FormField { key: string; label: string; type: string; required?: boolean; options?: string[] }
interface FormDraft {
  id: number | null;
  name: string;
  listId: number | null;
  fields: FormField[];
  tags: string[];
  doubleOptIn: boolean;
  title: string;
  description: string;
  buttonText: string;
  successMessage: string;
  redirectUrl: string;
  consentText: string;
  theme: { accent: string; background: string; text: string; radius: number };
  enabled: boolean;
}

const forms = ref<any[]>([]);
const lists = ref<{ id: number; name: string }[]>([]);
const customFields = ref<{ key: string; label: string; type: string; options: string[] | null }[]>([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const [f, l, cf] = await Promise.all([
      $fetch<any[]>("/api/audience/forms"),
      $fetch<any[]>("/api/lists"),
      $fetch<any[]>("/api/custom-fields"),
    ]);
    forms.value = f;
    lists.value = l;
    customFields.value = cf;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const BUILTIN = computed(() => [
  { key: "email", label: "Email", type: "email" },
  { key: "name", label: t("audience.fields.name"), type: "text" },
  { key: "company", label: t("audience.fields.company"), type: "text" },
  { key: "role", label: t("audience.fields.role"), type: "text" },
  { key: "phone", label: t("audience.fields.phone"), type: "tel" },
]);
const available = computed(() => {
  const used = new Set(draft.value?.fields.map((f) => f.key));
  const custom = customFields.value.map((c) => ({
    key: `custom.${c.key}`,
    label: c.label,
    type: c.type === "select" ? "select" : c.type === "boolean" ? "checkbox" : c.type === "date" ? "date" : c.type === "number" ? "number" : "text",
    options: c.options ?? undefined,
  }));
  return [...BUILTIN.value, ...custom].filter((f) => !used.has(f.key));
});

const draft = ref<FormDraft | null>(null);
const saving = ref(false);
const newTag = ref("");

function openNew() {
  draft.value = {
    id: null,
    name: "",
    listId: lists.value[0]?.id ?? null,
    fields: [{ key: "email", label: "Email", type: "email", required: true }, { key: "name", label: t("audience.fields.name"), type: "text" }],
    tags: [],
    doubleOptIn: true,
    title: t("audience.forms.default_title"),
    description: t("audience.forms.default_desc"),
    buttonText: "",
    successMessage: "",
    redirectUrl: "",
    consentText: t("audience.forms.default_consent"),
    theme: { accent: "#6366f1", background: "#ffffff", text: "#0f172a", radius: 10 },
    enabled: true,
  };
}
function openEdit(f: any) {
  draft.value = {
    id: f.id,
    name: f.name,
    listId: f.listId,
    fields: structuredClone(toRaw(f.fields)),
    tags: [...f.tags],
    doubleOptIn: f.doubleOptIn,
    title: f.title ?? "",
    description: f.description ?? "",
    buttonText: f.buttonText ?? "",
    successMessage: f.successMessage ?? "",
    redirectUrl: f.redirectUrl ?? "",
    consentText: f.consentText ?? "",
    theme: { accent: "#6366f1", background: "#ffffff", text: "#0f172a", radius: 10, ...(f.theme ?? {}) },
    enabled: f.enabled,
  };
}

function addField(key: string) {
  const f = available.value.find((x) => x.key === key);
  if (f && draft.value) draft.value.fields.push({ ...f, required: false });
}
function move(i: number, dir: -1 | 1) {
  const arr = draft.value!.fields;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
function addTag() {
  const v = newTag.value.trim();
  if (v && draft.value && !draft.value.tags.includes(v)) draft.value.tags.push(v);
  newTag.value = "";
}

async function saveForm() {
  if (!draft.value) return;
  saving.value = true;
  try {
    const { id, ...body } = draft.value;
    if (id) await $fetch(`/api/audience/forms/${id}`, { method: "PUT", body });
    else await $fetch("/api/audience/forms", { method: "POST", body });
    showToast(t("audience.forms.saved"), "success");
    draft.value = null;
    await load();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    saving.value = false;
  }
}

async function remove(f: any) {
  if (!(await showDialog({ type: "confirm", title: t("audience.forms.delete_title"), message: f.name }))) return;
  await $fetch(`/api/audience/forms/${f.id}`, { method: "DELETE" }).catch((e) => showToast(e?.data?.statusMessage || e.message, "error"));
  await load();
}

function copy(text: string) {
  navigator.clipboard?.writeText(text);
  showToast(t("settings.copied"), "info");
}

const previewStyle = computed(() => {
  const th = draft.value?.theme;
  return th ? { "--f-accent": th.accent, "--f-bg": th.background, "--f-fg": th.text, "--f-radius": `${th.radius}px` } : {};
});
</script>

<template>
  <div v-if="loading" class="tm-loading"><Loader2 :size="18" class="tm-spin" /></div>

  <!-- Editor -->
  <div v-else-if="draft" class="form-editor">
    <section class="tm-card">
      <h3 class="tm-card-title"><span class="tm-title-left"><button class="tm-btn tm-btn-sm tm-btn-ghost" @click="draft = null"><ArrowLeft :size="13" /></button>
        {{ draft.id ? t("audience.forms.edit") : t("audience.forms.new") }}</span>
        <label class="tm-check" style="text-transform: none; letter-spacing: 0"><input v-model="draft.enabled" type="checkbox" /> {{ t("audience.forms.enabled") }}</label>
      </h3>
      <div class="tm-row">
        <div class="tm-field"><label>{{ t("audience.forms.name") }}</label><input v-model="draft.name" class="tm-input" :placeholder="t('audience.forms.name_ph')" /></div>
        <div class="tm-field"><label>{{ t("audience.forms.list") }}</label>
          <select v-model="draft.listId" class="tm-select"><option :value="null">—</option><option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }}</option></select>
        </div>
      </div>

      <span class="tm-label">{{ t("audience.forms.fields") }}</span>
      <div class="ff-list">
        <div v-for="(f, i) in draft.fields" :key="f.key" class="ff-row">
          <div class="ff-move">
            <button class="tm-btn tm-btn-sm tm-btn-ghost" :disabled="i === 0" @click="move(i, -1)"><ArrowUp :size="11" /></button>
            <button class="tm-btn tm-btn-sm tm-btn-ghost" :disabled="i === draft.fields.length - 1" @click="move(i, 1)"><ArrowDown :size="11" /></button>
          </div>
          <input v-model="f.label" class="tm-input" />
          <code class="tm-muted ff-key">{{ f.key }}</code>
          <label class="tm-check"><input v-model="f.required" type="checkbox" :disabled="f.key === 'email'" /> {{ t("audience.forms.required") }}</label>
          <button class="tm-btn tm-btn-sm tm-btn-ghost" :disabled="f.key === 'email'" @click="draft.fields.splice(i, 1)"><X :size="12" /></button>
        </div>
      </div>
      <select v-if="available.length" class="tm-select" :value="''" @change="(e) => { addField((e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).value = ''; }">
        <option value="" disabled>+ {{ t("audience.forms.add_field") }}</option>
        <option v-for="f in available" :key="f.key" :value="f.key">{{ f.label }}</option>
      </select>

      <div class="tm-field"><label>{{ t("audience.forms.title_label") }}</label><input v-model="draft.title" class="tm-input" /></div>
      <div class="tm-field"><label>{{ t("audience.forms.description") }}</label><textarea v-model="draft.description" class="tm-textarea" rows="2"></textarea></div>
      <div class="tm-row">
        <div class="tm-field"><label>{{ t("audience.forms.button") }}</label><input v-model="draft.buttonText" class="tm-input" :placeholder="t('audience.forms.button_ph')" /></div>
        <div class="tm-field"><label>{{ t("audience.forms.redirect") }}</label><input v-model="draft.redirectUrl" class="tm-input" placeholder="https://" /></div>
      </div>
      <div class="tm-field"><label>{{ t("audience.forms.success") }}</label><input v-model="draft.successMessage" class="tm-input" :placeholder="t('audience.forms.success_ph')" /></div>
      <div class="tm-field"><label>{{ t("audience.forms.consent") }}</label><textarea v-model="draft.consentText" class="tm-textarea" rows="2"></textarea>
        <p class="tm-hint">{{ t("audience.forms.consent_hint") }}</p></div>

      <div class="tm-field"><label>{{ t("audience.forms.tags") }}</label>
        <div class="chips"><span v-for="(tg, i) in draft.tags" :key="tg" class="tm-badge accent">{{ tg }} <button class="chip-x" @click="draft.tags.splice(i, 1)"><X :size="10" /></button></span></div>
        <input v-model="newTag" class="tm-input" :placeholder="t('audience.forms.tag_ph')" @keydown.enter.prevent="addTag" @blur="addTag" />
      </div>
      <label class="tm-check"><input v-model="draft.doubleOptIn" type="checkbox" /> {{ t("audience.forms.doi") }}</label>

      <span class="tm-label">{{ t("audience.forms.design") }}</span>
      <div class="tm-row">
        <label class="color-pick"><input v-model="draft.theme.accent" type="color" /> {{ t("audience.forms.accent") }}</label>
        <label class="color-pick"><input v-model="draft.theme.background" type="color" /> {{ t("audience.forms.background") }}</label>
        <label class="color-pick"><input v-model="draft.theme.text" type="color" /> {{ t("audience.forms.text") }}</label>
        <label class="color-pick">{{ t("audience.forms.radius") }} <input v-model.number="draft.theme.radius" type="range" min="0" max="24" /></label>
      </div>
      <div class="tm-actions">
        <button class="tm-btn" @click="draft = null">{{ t("common.cancel") }}</button>
        <button class="tm-btn tm-btn-primary" :disabled="saving || !draft.name.trim()" @click="saveForm">{{ t("common.save") }}</button>
      </div>
    </section>

    <!-- Live preview (approximation of the hosted page) -->
    <aside class="form-preview-wrap">
      <span class="tm-label">{{ t("audience.forms.preview") }}</span>
      <div class="form-preview" :style="previewStyle">
        <h1 v-if="draft.title">{{ draft.title }}</h1>
        <p v-if="draft.description" class="fp-desc">{{ draft.description }}</p>
        <template v-for="f in draft.fields" :key="f.key">
          <label v-if="f.type === 'checkbox'" class="fp-chk"><input type="checkbox" disabled /> {{ f.label }}</label>
          <template v-else>
            <label>{{ f.label }}{{ f.required ? " *" : "" }}</label>
            <div class="fp-input"></div>
          </template>
        </template>
        <label v-if="draft.consentText" class="fp-chk"><input type="checkbox" disabled /> {{ draft.consentText }}</label>
        <div class="fp-btn">{{ draft.buttonText || t("audience.forms.button_ph") }}</div>
      </div>
    </aside>
  </div>

  <!-- List -->
  <section v-else class="tm-card">
    <h3 class="tm-card-title">
      <span class="tm-title-left"><FileInput :size="14" /> {{ t("audience.forms.title") }}</span>
      <button v-if="can('editor')" class="tm-btn tm-btn-sm" @click="openNew"><Plus :size="12" /> {{ t("audience.forms.new") }}</button>
    </h3>
    <p class="tm-hint">{{ t("audience.forms.hint") }}</p>
    <div v-if="!forms.length" class="tm-empty">{{ t("audience.forms.empty") }}</div>
    <div v-for="f in forms" :key="f.id" class="form-item">
      <div class="form-item-head">
        <strong>{{ f.name }}</strong>
        <span class="tm-badge" :class="f.enabled ? 'ok' : ''">{{ f.enabled ? t("audience.forms.active") : t("audience.forms.off") }}</span>
        <span class="tm-muted" style="font-size: 12px">{{ t("audience.forms.submissions", { n: f.submissions }) }}</span>
        <span style="flex: 1"></span>
        <a class="tm-btn tm-btn-sm tm-btn-ghost" :href="f.hostedUrl" target="_blank" rel="noopener" :title="t('audience.forms.open')"><ExternalLink :size="13" /></a>
        <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.edit')" @click="openEdit(f)"><Pencil :size="13" /></button>
        <button v-if="can('editor')" class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.delete')" @click="remove(f)"><Trash2 :size="13" /></button>
      </div>
      <div class="form-codes">
        <div><span class="tm-label">{{ t("audience.forms.hosted") }}</span>
          <div class="code-row"><code>{{ f.hostedUrl }}</code><button class="tm-btn tm-btn-sm tm-btn-ghost" @click="copy(f.hostedUrl)"><Copy :size="12" /></button></div></div>
        <div><span class="tm-label">{{ t("audience.forms.embed") }}</span>
          <div class="code-row"><code>{{ f.embedCode }}</code><button class="tm-btn tm-btn-sm tm-btn-ghost" @click="copy(f.embedCode)"><Copy :size="12" /></button></div></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.form-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;
}
.form-preview-wrap {
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-preview {
  background: var(--f-bg);
  color: var(--f-fg);
  border-radius: calc(var(--f-radius) + 6px);
  padding: 24px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.form-preview h1 {
  font-size: 20px;
  margin: 0 0 6px;
}
.fp-desc {
  margin: 0 0 14px;
  opacity: 0.75;
  font-size: 14px;
  line-height: 1.5;
}
.form-preview label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  margin: 12px 0 5px;
}
.fp-input {
  height: 40px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: var(--f-radius);
  background: #fff;
}
.fp-chk {
  display: flex !important;
  gap: 8px;
  font-weight: 400 !important;
  line-height: 1.4;
}
.fp-btn {
  margin-top: 18px;
  padding: 12px;
  text-align: center;
  border-radius: var(--f-radius);
  background: var(--f-accent);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
}
.ff-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ff-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
}
.ff-move {
  display: flex;
  flex-direction: column;
}
.ff-move .tm-btn {
  padding: 1px 4px;
}
.ff-key {
  font-size: 11px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.chip-x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
}
.color-pick {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.color-pick input[type="color"] {
  width: 30px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  padding: 0;
}
.form-item {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.form-codes {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
}
.code-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.code-row code {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 960px) {
  .form-editor,
  .form-codes {
    grid-template-columns: 1fr;
  }
  .form-preview-wrap {
    position: static;
  }
}
</style>
