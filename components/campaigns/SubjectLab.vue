<script setup lang="ts">
import { FlaskConical, X, Loader2, Sparkles, RefreshCcw } from "lucide-vue-next";

// AI subject lab: proposals with different angles, scored against spam
// signals and this sender's own history. Apply as subject A or B.
const props = defineProps<{ campaignId: number; subject: string; canUseB: boolean }>();
const emit = defineEmits<{ close: []; apply: [p: { subject: string; preheader: string; as: "A" | "B" }] }>();
const { t } = useI18n();

interface Proposal { subject: string; preheader: string; angle: string; why: string; score: number; notes: string[] }
const loading = ref(false);
const error = ref("");
const goal = ref("");
const proposals = ref<Proposal[]>([]);
const current = ref<{ subject: string; score: number; notes: string[] } | null>(null);

async function run() {
  loading.value = true;
  error.value = "";
  try {
    const r = await $fetch<{ proposals: Proposal[]; current: any }>("/api/ai/subjects", {
      method: "POST",
      body: { campaignId: props.campaignId, subject: props.subject, goal: goal.value || undefined, count: 8 },
    });
    proposals.value = r.proposals;
    current.value = r.current;
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(run);

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));

const scoreClass = (s: number) => (s >= 80 ? "ok" : s >= 60 ? "warn" : "bad");
</script>

<template>
  <div class="tm-modal-backdrop" @click.self="emit('close')">
    <div class="tm-modal lab" role="dialog" aria-modal="true">
      <div class="tm-modal-head">
        <h2><FlaskConical :size="17" /> {{ t("lab.title") }}</h2>
        <button class="tm-btn tm-btn-ghost tm-icon-btn" @click="emit('close')"><X :size="16" /></button>
      </div>
      <div class="tm-modal-body">
        <p class="tm-hint">{{ t("lab.hint") }}</p>
        <div class="tm-row" style="align-items: flex-end">
          <div class="tm-field" style="flex: 1 1 260px"><label>{{ t("lab.goal") }}</label>
            <input v-model="goal" class="tm-input" :placeholder="t('lab.goal_ph')" @keydown.enter="run" /></div>
          <button class="tm-btn" :disabled="loading" @click="run"><RefreshCcw :size="13" /> {{ t("lab.regenerate") }}</button>
        </div>

        <div v-if="current" class="current">
          <span class="tm-label">{{ t("lab.current") }}</span>
          <div class="prop-row">
            <span class="score" :class="scoreClass(current.score)">{{ current.score }}</span>
            <strong>{{ current.subject }}</strong>
          </div>
        </div>

        <div v-if="loading" class="tm-loading"><Loader2 :size="18" class="tm-spin" /> {{ t("lab.thinking") }}</div>
        <p v-else-if="error" class="tm-hint" style="color: #fb7185">{{ error }}</p>
        <div v-else class="props">
          <article v-for="(p, i) in proposals" :key="i" class="prop">
            <div class="prop-row">
              <span class="score" :class="scoreClass(p.score)" :title="t('lab.score_hint')">{{ p.score }}</span>
              <div class="prop-text">
                <strong>{{ p.subject }}</strong>
                <span class="pre">{{ p.preheader }}</span>
              </div>
            </div>
            <div class="prop-meta">
              <span class="tm-badge accent">{{ p.angle }}</span>
              <span class="why">{{ p.why }}</span>
            </div>
            <div class="prop-actions">
              <button class="tm-btn tm-btn-sm tm-btn-primary" @click="emit('apply', { subject: p.subject, preheader: p.preheader, as: 'A' })"><Sparkles :size="12" /> {{ t("lab.use_a") }}</button>
              <button v-if="canUseB" class="tm-btn tm-btn-sm" @click="emit('apply', { subject: p.subject, preheader: p.preheader, as: 'B' })">{{ t("lab.use_b") }}</button>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lab {
  width: min(760px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.lab .tm-modal-body {
  overflow-y: auto;
}
.lab h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.props {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.prop,
.current {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}
.current {
  border-style: dashed;
}
.prop-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.prop-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pre {
  font-size: 12px;
  color: var(--text-muted);
}
.score {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  border: 2px solid;
}
.score.ok {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.6);
}
.score.warn {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.6);
}
.score.bad {
  color: #fb7185;
  border-color: rgba(251, 113, 133, 0.6);
}
.prop-meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
  font-size: 12px;
}
.why {
  color: var(--text-muted);
}
.prop-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
</style>
