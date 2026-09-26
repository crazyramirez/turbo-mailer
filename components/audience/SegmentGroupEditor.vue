<script setup lang="ts">
import { Plus, X, FolderPlus } from "lucide-vue-next";
import type { SegRule, SegGroup, SegMeta } from "~/utils/segment-types";


const props = defineProps<{ group: SegGroup; meta: SegMeta; depth?: number; removable?: boolean }>();
const emit = defineEmits<{ remove: [] }>();
const { t, te } = useI18n();
const depth = computed(() => props.depth ?? 1);

const isGroup = (r: SegRule | SegGroup): r is SegGroup => Array.isArray((r as SegGroup).rules);
const fieldOf = (key: string) => props.meta.fields.find((f) => f.key === key);
const kindOf = (key: string) => fieldOf(key)?.kind ?? "string";
const opsOf = (key: string) => props.meta.ops[kindOf(key)] ?? [];

const fieldLabel = (f: { key: string; label?: string }) =>
  f.label ?? (te(`audience.fields.${f.key}`) ? t(`audience.fields.${f.key}`) : f.key);
const opLabel = (op: string) => (te(`audience.ops.${op}`) ? t(`audience.ops.${op}`) : op);

// Field picker grouped so 20+ options stay scannable
const FIELD_GROUPS: Record<string, string[]> = {
  contact: ["email", "email_domain", "name", "company", "role", "phone", "locale", "source", "status", "verification"],
  membership: ["list", "tags"],
  engagement: ["behavior", "last_engaged_at", "last_sent_at", "engagement_score", "sent_since_engaged", "created_at"],
};
const groupedFields = computed(() => {
  const out = Object.entries(FIELD_GROUPS).map(([g, keys]) => ({
    id: g,
    fields: keys.map((k) => fieldOf(k)).filter(Boolean) as SegMeta["fields"],
  }));
  const custom = props.meta.fields.filter((f) => f.key.startsWith("custom."));
  if (custom.length) out.push({ id: "custom", fields: custom });
  return out;
});

const NO_VALUE = new Set(["empty", "not_empty", "is_true", "is_false"]);
const DAY_OPS = new Set(["within_days", "older_than_days", "anniversary_in_days", "engaged_within_days", "not_engaged_within_days", "received_within_days"]);
const CAMPAIGN_OPS = new Set(["opened_campaign", "not_opened_campaign", "clicked_campaign", "not_clicked_campaign", "received_campaign", "not_received_campaign"]);

function valueKind(r: SegRule): string {
  if (NO_VALUE.has(r.op)) return "none";
  if (DAY_OPS.has(r.op)) return "days";
  if (CAMPAIGN_OPS.has(r.op)) return "campaign";
  const k = kindOf(r.field);
  if (k === "date") return "date";
  if (k === "number") return "number";
  if (k === "status") return "status";
  if (k === "verification") return "verification";
  if (k === "tags") return "tags";
  if (k === "list") return "list";
  if (fieldOf(r.field)?.options?.length) return "select";
  return "text";
}

function defaultValue(r: SegRule) {
  switch (valueKind(r)) {
    case "none": return undefined;
    case "days": return 30;
    case "status": return "active";
    case "verification": return "valid";
    case "tags": return [];
    case "list": return props.meta.lists[0]?.id;
    case "campaign": return props.meta.campaigns[0]?.id;
    default: return "";
  }
}

function onFieldChange(r: SegRule) {
  r.op = opsOf(r.field)[0];
  r.value = defaultValue(r);
}
function onOpChange(r: SegRule, prevKind: string) {
  if (valueKind(r) !== prevKind) r.value = defaultValue(r);
}

function addRule() {
  const r: SegRule = { field: "behavior", op: "engaged_within_days" };
  r.value = defaultValue(r);
  props.group.rules.push(r);
}
function addGroup() {
  const r: SegRule = { field: "email_domain", op: "eq", value: "" };
  props.group.rules.push({ match: props.group.match === "all" ? "any" : "all", rules: [r] });
}

// Tags: comma/enter separated chips
const tagDraft = reactive<Record<number, string>>({});
function addTag(r: SegRule, i: number) {
  const parts = String(tagDraft[i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return;
  r.value = [...new Set([...(Array.isArray(r.value) ? r.value : []), ...parts])];
  tagDraft[i] = "";
}
</script>

<template>
  <div class="seg-group" :class="`d${depth}`">
    <div class="seg-group-head">
      <span class="seg-match-label">{{ t("audience.seg.match_prefix") }}</span>
      <div class="seg-match">
        <button :class="{ on: group.match === 'all' }" @click="group.match = 'all'">{{ t("audience.seg.all") }}</button>
        <button :class="{ on: group.match === 'any' }" @click="group.match = 'any'">{{ t("audience.seg.any") }}</button>
      </div>
      <span class="seg-match-label">{{ t("audience.seg.match_suffix") }}</span>
      <button v-if="removable" class="tm-btn tm-btn-sm tm-btn-ghost seg-remove-group" :title="t('audience.seg.remove_group')" @click="emit('remove')"><X :size="13" /></button>
    </div>

    <div v-for="(r, i) in group.rules" :key="i" class="seg-item">
      <span v-if="i > 0" class="seg-joiner">{{ group.match === "all" ? t("audience.seg.and") : t("audience.seg.or") }}</span>
      <SegmentGroupEditor v-if="isGroup(r)" :group="r" :meta="meta" :depth="depth + 1" removable @remove="group.rules.splice(i, 1)" />
      <div v-else class="seg-rule">
        <select v-model="r.field" class="tm-select seg-field" @change="onFieldChange(r)">
          <optgroup v-for="g in groupedFields" :key="g.id" :label="t(`audience.seg.group_${g.id}`)">
            <option v-for="f in g.fields" :key="f.key" :value="f.key">{{ fieldLabel(f) }}</option>
          </optgroup>
        </select>
        <select :value="r.op" class="tm-select seg-op" @change="(e) => { const prev = valueKind(r); r.op = (e.target as HTMLSelectElement).value; onOpChange(r, prev); }">
          <option v-for="op in opsOf(r.field)" :key="op" :value="op">{{ opLabel(op) }}</option>
        </select>

        <template v-if="valueKind(r) === 'text'"><input v-model="r.value" class="tm-input seg-val" :placeholder="t('audience.seg.value')" /></template>
        <template v-else-if="valueKind(r) === 'number'"><input v-model.number="r.value" type="number" class="tm-input seg-val" /></template>
        <template v-else-if="valueKind(r) === 'days'">
          <div class="seg-days"><input v-model.number="r.value" type="number" min="0" class="tm-input" /><span>{{ t("audience.seg.days") }}</span></div>
        </template>
        <template v-else-if="valueKind(r) === 'date'"><input v-model="r.value" type="date" class="tm-input seg-val" /></template>
        <select v-else-if="valueKind(r) === 'status'" v-model="r.value" class="tm-select seg-val">
          <option v-for="s in ['active', 'unsubscribed', 'bounced', 'inactive']" :key="s" :value="s">{{ t(`audience.status.${s}`) }}</option>
        </select>
        <select v-else-if="valueKind(r) === 'verification'" v-model="r.value" class="tm-select seg-val">
          <option v-for="s in ['valid', 'risky', 'invalid']" :key="s" :value="s">{{ t(`audience.verification.${s}`) }}</option>
        </select>
        <select v-else-if="valueKind(r) === 'select'" v-model="r.value" class="tm-select seg-val">
          <option v-for="o in fieldOf(r.field)?.options ?? []" :key="o" :value="o">{{ o }}</option>
        </select>
        <select v-else-if="valueKind(r) === 'list'" v-model.number="r.value" class="tm-select seg-val">
          <option v-for="l in meta.lists" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <select v-else-if="valueKind(r) === 'campaign'" v-model.number="r.value" class="tm-select seg-val">
          <option v-for="c in meta.campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <div v-else-if="valueKind(r) === 'tags'" class="seg-tags">
          <span v-for="(tg, j) in (r.value as string[])" :key="tg" class="tm-badge accent">{{ tg }}
            <button class="seg-chip-x" @click="(r.value as string[]).splice(j, 1)"><X :size="10" /></button></span>
          <input v-model="tagDraft[i]" class="tm-input" :list="`seg-tags-${depth}`" :placeholder="t('audience.seg.add_tag')" @keydown.enter.prevent="addTag(r, i)" @blur="addTag(r, i)" />
          <datalist :id="`seg-tags-${depth}`"><option v-for="tg in meta.tags" :key="tg.tag" :value="tg.tag" /></datalist>
        </div>

        <button class="tm-btn tm-btn-sm tm-btn-ghost seg-del" :title="t('common.delete')" @click="group.rules.splice(i, 1)"><X :size="13" /></button>
      </div>
    </div>

    <div class="seg-add">
      <button class="tm-btn tm-btn-sm" @click="addRule"><Plus :size="12" /> {{ t("audience.seg.add_rule") }}</button>
      <button v-if="depth < 3" class="tm-btn tm-btn-sm tm-btn-ghost" @click="addGroup"><FolderPlus :size="12" /> {{ t("audience.seg.add_group") }}</button>
    </div>
  </div>
</template>

<style scoped>
.seg-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.015);
}
.seg-group.d2 {
  background: rgba(99, 102, 241, 0.05);
  border-color: rgba(129, 140, 248, 0.25);
}
.seg-group.d3 {
  background: rgba(16, 185, 129, 0.04);
  border-color: rgba(52, 211, 153, 0.22);
}
.seg-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
}
.seg-match-label {
  color: var(--text-muted);
}
.seg-match {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
}
.seg-match button {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.seg-match button.on {
  background: rgba(99, 102, 241, 0.25);
  color: #fff;
}
.seg-remove-group {
  margin-left: auto;
}
.seg-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.seg-joiner {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-light, #a5b4fc);
  padding-left: 4px;
}
.seg-rule {
  display: grid;
  grid-template-columns: minmax(150px, 1.1fr) minmax(140px, 1fr) minmax(160px, 1.3fr) auto;
  gap: 8px;
  align-items: center;
}
.seg-days {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.seg-days input {
  max-width: 100px;
}
.seg-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.seg-tags input {
  flex: 1 1 120px;
  min-width: 100px;
}
.seg-chip-x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
}
.seg-add {
  display: flex;
  gap: 8px;
}
@media (max-width: 720px) {
  .seg-rule {
    grid-template-columns: 1fr auto;
  }
  .seg-rule > :nth-child(2),
  .seg-rule > :nth-child(3) {
    grid-column: 1 / 2;
  }
  .seg-del {
    grid-row: 1;
    grid-column: 2;
  }
}
</style>
