<script setup lang="ts">
import { Mail, Clock, CalendarClock, GitBranch, Tag, ListPlus, PenLine, Webhook, LogOut, Plus } from "lucide-vue-next";
import type { AutoStepUI } from "~/utils/automation-types";
import { newStep, STEP_TYPES } from "~/utils/automation-types";

const props = defineProps<{
  steps: AutoStepUI[];
  selectedId: string | null;
  stats: Record<string, { sent: number; opens: number; clicks: number; skipped: number }>;
  readonly?: boolean;
}>();
const emit = defineEmits<{ select: [step: AutoStepUI] }>();
const { t } = useI18n();

const ICONS: Record<string, any> = {
  email: Mail, wait: Clock, wait_until: CalendarClock, condition: GitBranch, tag: Tag,
  list: ListPlus, field: PenLine, webhook: Webhook, exit: LogOut,
};

const menuAt = ref<number | null>(null);
function insert(index: number, type: AutoStepUI["type"]) {
  const s = newStep(type);
  props.steps.splice(index, 0, s);
  menuAt.value = null;
  emit("select", s);
}

const WEEKDAY_SHORT = computed(() => [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(2024, 0, 7 + d).toLocaleDateString(undefined, { weekday: "short" })));

function summary(s: AutoStepUI): string {
  switch (s.type) {
    case "email": return s.subject || t("automations.step.no_subject");
    case "wait": return t("automations.step.wait_summary", { n: s.amount ?? 1, unit: t(`automations.units.${s.unit ?? "days"}`) });
    case "wait_until": {
      const days = s.weekdays?.length ? s.weekdays.map((d) => WEEKDAY_SHORT.value[d]).join(", ") : t("automations.step.any_day");
      return t("automations.step.wait_until_summary", { days, hour: String(s.hour ?? 9).padStart(2, "0") });
    }
    case "condition": return t(`automations.cond.${s.condition?.kind ?? "opened_last"}`);
    case "tag": return `${s.action === "remove" ? "−" : "+"} ${s.tag || "…"}`;
    case "list": return t(s.action === "remove" ? "automations.step.list_remove" : "automations.step.list_add");
    case "field": return s.key ? `${s.key} = ${s.value ?? ""}` : "…";
    case "webhook": return s.url || "https://…";
    case "exit": return t("automations.step.exit_summary");
  }
  return "";
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
</script>

<template>
  <div class="flow">
    <template v-for="(s, i) in steps" :key="s.id">
      <div class="connector">
        <button v-if="!readonly" class="add-btn" :class="{ open: menuAt === i }" :title="t('automations.add_step')" @click="menuAt = menuAt === i ? null : i"><Plus :size="12" /></button>
        <div v-if="menuAt === i" class="add-menu">
          <button v-for="ty in STEP_TYPES" :key="ty" @click="insert(i, ty)"><component :is="ICONS[ty]" :size="13" /> {{ t(`automations.types.${ty}`) }}</button>
        </div>
      </div>

      <div class="node" :class="[`t-${s.type}`, { sel: selectedId === s.id }]" role="button" tabindex="0" @click="emit('select', s)" @keydown.enter="emit('select', s)">
        <span class="node-icon"><component :is="ICONS[s.type]" :size="15" /></span>
        <div class="node-body">
          <span class="node-type">{{ t(`automations.types.${s.type}`) }}</span>
          <span class="node-summary">{{ summary(s) }}</span>
          <span v-if="s.type === 'email' && stats[s.id]" class="node-stats">
            {{ t("automations.step.stats", { sent: stats[s.id].sent, opens: pct(stats[s.id].opens, stats[s.id].sent), clicks: pct(stats[s.id].clicks, stats[s.id].sent) }) }}
          </span>
        </div>
      </div>

      <div v-if="s.type === 'condition'" class="branches">
        <div class="branch yes">
          <span class="branch-label">{{ t("automations.yes") }}</span>
          <StepList :steps="s.yes ?? []" :selected-id="selectedId" :stats="stats" :readonly="readonly" @select="(x) => emit('select', x)" />
        </div>
        <div class="branch no">
          <span class="branch-label">{{ t("automations.no") }}</span>
          <StepList :steps="s.no ?? []" :selected-id="selectedId" :stats="stats" :readonly="readonly" @select="(x) => emit('select', x)" />
        </div>
      </div>
    </template>

    <div class="connector end">
      <button v-if="!readonly" class="add-btn" :class="{ open: menuAt === steps.length }" :title="t('automations.add_step')" @click="menuAt = menuAt === steps.length ? null : steps.length"><Plus :size="12" /></button>
      <div v-if="menuAt === steps.length" class="add-menu">
        <button v-for="ty in STEP_TYPES" :key="ty" @click="insert(steps.length, ty)"><component :is="ICONS[ty]" :size="13" /> {{ t(`automations.types.${ty}`) }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.connector {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 34px;
  justify-content: center;
}
.connector::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(rgba(129, 140, 248, 0.35), rgba(129, 140, 248, 0.15));
}
.connector.end {
  min-height: 40px;
}
.add-btn {
  position: relative;
  z-index: 1;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface, #0b0d18);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.add-btn:hover,
.add-btn.open {
  color: #fff;
  border-color: rgba(129, 140, 248, 0.7);
  background: rgba(99, 102, 241, 0.35);
}
.add-menu {
  position: relative;
  z-index: 5;
  margin: 6px 0;
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 4px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(10, 11, 22, 0.98);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.add-menu button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}
.add-menu button:hover {
  background: rgba(99, 102, 241, 0.18);
}
.node {
  width: min(100%, 340px);
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  text-align: left;
}
.node:hover {
  border-color: rgba(129, 140, 248, 0.45);
}
.node.sel {
  border-color: rgba(129, 140, 248, 0.9);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}
.node-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(99, 102, 241, 0.18);
  color: #a5b4fc;
}
.t-wait .node-icon,
.t-wait_until .node-icon {
  background: rgba(251, 191, 36, 0.14);
  color: #fbbf24;
}
.t-condition .node-icon {
  background: rgba(236, 72, 153, 0.15);
  color: #f472b6;
}
.t-tag .node-icon,
.t-list .node-icon,
.t-field .node-icon {
  background: rgba(52, 211, 153, 0.14);
  color: #34d399;
}
.t-webhook .node-icon {
  background: rgba(56, 189, 248, 0.14);
  color: #38bdf8;
}
.t-exit .node-icon {
  background: rgba(148, 163, 184, 0.14);
  color: #94a3b8;
}
.node-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-stats {
  font-size: 11px;
  color: #34d399;
}
.branches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  margin-top: 8px;
}
.branch {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 6px 0;
  border-radius: 14px;
  border: 1px dashed var(--border);
}
.branch.yes {
  border-color: rgba(52, 211, 153, 0.3);
}
.branch.no {
  border-color: rgba(251, 113, 133, 0.3);
}
.branch-label {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.branch.yes .branch-label {
  color: #34d399;
}
.branch.no .branch-label {
  color: #fb7185;
}
</style>
