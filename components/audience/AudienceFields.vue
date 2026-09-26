<script setup lang="ts">
import { Braces, Tags, Plus, Pencil, Trash2, X, Copy, Eye, EyeOff } from "lucide-vue-next";

const { t } = useI18n();
const { showToast, showDialog } = useDashboardState();
const { can } = useMe();

const err = (e: any) => showToast(e?.data?.statusMessage || e?.message || "Error", "error");
function copy(text: string) {
  navigator.clipboard?.writeText(text);
  showToast(t("settings.copied"), "info");
}
// Built in script: a literal "}}" inside a template mustache ends it early
const mergeTag = (key: string) => "{" + "{" + key + "}" + "}";

// ── Custom fields ─────────────────────────────────────────────────────
const fields = ref<any[]>([]);
async function loadFields() {
  fields.value = await $fetch<any[]>("/api/custom-fields");
}
const fieldModal = ref<{ id: number | null; label: string; key: string; type: string; options: string } | null>(null);
function newField() {
  fieldModal.value = { id: null, label: "", key: "", type: "text", options: "" };
}
function editField(f: any) {
  fieldModal.value = { id: f.id, label: f.label, key: f.key, type: f.type, options: (f.options ?? []).join("\n") };
}
async function saveField() {
  const m = fieldModal.value;
  if (!m) return;
  const options = m.options.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  try {
    if (m.id) await $fetch(`/api/custom-fields/${m.id}`, { method: "PUT", body: { label: m.label, options } });
    else await $fetch("/api/custom-fields", { method: "POST", body: { label: m.label, key: m.key || undefined, type: m.type, options } });
    fieldModal.value = null;
    await loadFields();
  } catch (e) {
    err(e);
  }
}
async function deleteField(f: any, force = false) {
  if (!force && !(await showDialog({ type: "confirm", title: t("audience.fields_tab.delete_title"), message: t("audience.fields_tab.delete_msg", { label: f.label }) }))) return;
  try {
    await $fetch(`/api/custom-fields/${f.id}`, { method: "DELETE", query: force ? { force: "1" } : {} });
    await loadFields();
  } catch (e: any) {
    if (e?.status === 409 || e?.statusCode === 409) {
      if (await showDialog({ type: "confirm", title: t("audience.fields_tab.in_use"), message: e?.data?.statusMessage })) return deleteField(f, true);
    } else err(e);
  }
}
const keyPreview = computed(() => {
  const l = fieldModal.value?.label ?? "";
  return (fieldModal.value?.key || l.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")).slice(0, 40);
});

// ── Topics (subscription preferences) ────────────────────────────────
const topics = ref<any[]>([]);
async function loadTopics() {
  topics.value = await $fetch<any[]>("/api/topics");
}
const topicModal = ref<{ id: number | null; name: string; description: string; isPublic: boolean } | null>(null);
async function saveTopic() {
  const m = topicModal.value;
  if (!m) return;
  try {
    const body = { name: m.name, description: m.description, isPublic: m.isPublic };
    if (m.id) await $fetch(`/api/topics/${m.id}`, { method: "PUT", body });
    else await $fetch("/api/topics", { method: "POST", body });
    topicModal.value = null;
    await loadTopics();
  } catch (e) {
    err(e);
  }
}
async function deleteTopic(tp: any) {
  if (!(await showDialog({ type: "confirm", title: t("audience.topics.delete_title"), message: tp.name }))) return;
  await $fetch(`/api/topics/${tp.id}`, { method: "DELETE" }).catch(err);
  await loadTopics();
}

onMounted(() => Promise.all([loadFields(), loadTopics()]));
</script>

<template>
  <div class="tm-grid-2">
    <section class="tm-card">
      <h3 class="tm-card-title">
        <span class="tm-title-left"><Braces :size="14" /> {{ t("audience.fields_tab.title") }}</span>
        <button v-if="can('editor')" class="tm-btn tm-btn-sm" @click="newField"><Plus :size="12" /> {{ t("audience.fields_tab.new") }}</button>
      </h3>
      <p class="tm-hint">{{ t("audience.fields_tab.hint") }}</p>
      <div v-if="!fields.length" class="tm-empty">{{ t("audience.fields_tab.empty") }}</div>
      <div v-else class="tm-table-wrap">
        <table class="tm-table">
          <thead><tr><th>{{ t("audience.fields_tab.label") }}</th><th>{{ t("audience.fields_tab.merge_tag") }}</th><th>{{ t("audience.fields_tab.type") }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="f in fields" :key="f.id">
              <td>{{ f.label }}</td>
              <td><button class="tag-btn" :title="t('settings.copy')" @click="copy(mergeTag(f.key))"><code>{{ mergeTag(f.key) }}</code> <Copy :size="11" /></button></td>
              <td><span class="tm-badge">{{ t(`audience.fields_tab.type_${f.type}`) }}</span></td>
              <td class="num">
                <button v-if="can('editor')" class="tm-btn tm-btn-sm tm-btn-ghost" @click="editField(f)"><Pencil :size="13" /></button>
                <button v-if="can('editor')" class="tm-btn tm-btn-sm tm-btn-ghost" @click="deleteField(f)"><Trash2 :size="13" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="tm-hint">{{ t("audience.fields_tab.usage") }}</p>
    </section>

    <section class="tm-card">
      <h3 class="tm-card-title">
        <span class="tm-title-left"><Tags :size="14" /> {{ t("audience.topics.title") }}</span>
        <button v-if="can('editor')" class="tm-btn tm-btn-sm" @click="topicModal = { id: null, name: '', description: '', isPublic: true }"><Plus :size="12" /> {{ t("audience.topics.new") }}</button>
      </h3>
      <p class="tm-hint">{{ t("audience.topics.hint") }}</p>
      <div v-if="!topics.length" class="tm-empty">{{ t("audience.topics.empty") }}</div>
      <div v-for="tp in topics" :key="tp.id" class="topic-row">
        <component :is="tp.isPublic ? Eye : EyeOff" :size="14" class="tm-muted" :title="tp.isPublic ? t('audience.topics.public') : t('audience.topics.hidden')" />
        <div class="topic-main"><strong>{{ tp.name }}</strong><span v-if="tp.description" class="tm-muted">{{ tp.description }}</span></div>
        <span class="tm-muted topic-out">{{ t("audience.topics.opted_out", { n: tp.optedOut }) }}</span>
        <button v-if="can('editor')" class="tm-btn tm-btn-sm tm-btn-ghost" @click="topicModal = { id: tp.id, name: tp.name, description: tp.description ?? '', isPublic: tp.isPublic }"><Pencil :size="13" /></button>
        <button v-if="can('editor')" class="tm-btn tm-btn-sm tm-btn-ghost" @click="deleteTopic(tp)"><Trash2 :size="13" /></button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="fieldModal" class="tm-modal-backdrop" @click.self="fieldModal = null">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head"><h2>{{ fieldModal.id ? t("audience.fields_tab.edit") : t("audience.fields_tab.new") }}</h2>
            <button class="tm-btn tm-btn-ghost tm-icon-btn" @click="fieldModal = null"><X :size="16" /></button></div>
          <div class="tm-modal-body">
            <div class="tm-field"><label>{{ t("audience.fields_tab.label") }}</label><input v-model="fieldModal.label" class="tm-input" :placeholder="t('audience.fields_tab.label_ph')" /></div>
            <template v-if="!fieldModal.id">
              <div class="tm-field"><label>{{ t("audience.fields_tab.merge_tag") }}</label><input v-model="fieldModal.key" class="tm-input tm-mono" :placeholder="keyPreview" />
                <p class="tm-hint">{{ t("audience.fields_tab.key_hint", { tag: mergeTag(keyPreview || "campo") }) }}</p></div>
              <div class="tm-field"><label>{{ t("audience.fields_tab.type") }}</label>
                <select v-model="fieldModal.type" class="tm-select">
                  <option v-for="ty in ['text', 'number', 'date', 'boolean', 'select']" :key="ty" :value="ty">{{ t(`audience.fields_tab.type_${ty}`) }}</option>
                </select></div>
            </template>
            <div v-if="fieldModal.type === 'select'" class="tm-field"><label>{{ t("audience.fields_tab.options") }}</label>
              <textarea v-model="fieldModal.options" class="tm-textarea" rows="4" :placeholder="t('audience.fields_tab.options_ph')"></textarea></div>
          </div>
          <div class="tm-modal-foot">
            <button class="tm-btn" @click="fieldModal = null">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="!fieldModal.label.trim()" @click="saveField">{{ t("common.save") }}</button>
          </div>
        </div>
      </div>

      <div v-if="topicModal" class="tm-modal-backdrop" @click.self="topicModal = null">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head"><h2>{{ topicModal.id ? t("audience.topics.edit") : t("audience.topics.new") }}</h2>
            <button class="tm-btn tm-btn-ghost tm-icon-btn" @click="topicModal = null"><X :size="16" /></button></div>
          <div class="tm-modal-body">
            <div class="tm-field"><label>{{ t("audience.topics.name") }}</label><input v-model="topicModal.name" class="tm-input" :placeholder="t('audience.topics.name_ph')" /></div>
            <div class="tm-field"><label>{{ t("audience.topics.description") }}</label><input v-model="topicModal.description" class="tm-input" /></div>
            <label class="tm-check"><input v-model="topicModal.isPublic" type="checkbox" /> {{ t("audience.topics.show_public") }}</label>
          </div>
          <div class="tm-modal-foot">
            <button class="tm-btn" @click="topicModal = null">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="!topicModal.name.trim()" @click="saveTopic">{{ t("common.save") }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tag-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}
.tag-btn code {
  font-size: 11.5px;
  color: var(--accent-light, #a5b4fc);
}
.topic-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.topic-row:last-child {
  border-bottom: none;
}
.topic-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.topic-main span {
  font-size: 11.5px;
}
.topic-out {
  font-size: 11.5px;
  white-space: nowrap;
}
</style>
