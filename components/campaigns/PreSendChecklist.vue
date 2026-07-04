<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { X, CheckCircle2, AlertTriangle, XCircle, Send, Loader2, ShieldCheck } from "lucide-vue-next";
const { t } = useI18n();

const props = defineProps<{ campaignId: number | string }>();
const emit = defineEmits<{ confirm: []; close: [] }>();

interface PrecheckItem {
  id: string;
  status: "pass" | "warn" | "fail";
  data?: Record<string, any>;
}
interface PrecheckResult {
  items: PrecheckItem[];
  blocked: boolean;
  warnings: number;
  active: number;
}

const loading = ref(true);
const error = ref("");
const result = ref<PrecheckResult | null>(null);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  try {
    // live=1 also HTTP-checks template links for 404s/dead hosts
    result.value = await $fetch<PrecheckResult>(
      `/api/campaigns/${props.campaignId}/precheck?live=1`,
    );
  } catch (e: any) {
    error.value = e.data?.statusMessage || e.message;
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => window.removeEventListener("keydown", onKeydown));

const sorted = computed(() => {
  if (!result.value) return [];
  const order = { fail: 0, warn: 1, pass: 2 };
  return [...result.value.items].sort(
    (a, b) => order[a.status] - order[b.status],
  );
});

function itemLabel(item: PrecheckItem): string {
  return t(`precheck.items.${item.id}.${item.status}`, item.data || {});
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
        <button @click="emit('close')" class="btn-close"><X :size="18" /></button>
      </div>

      <div class="pc-body">
        <div v-if="loading" class="pc-state">
          <Loader2 :size="20" class="spin" />
          <span>{{ t("precheck.running") }}</span>
        </div>
        <div v-else-if="error" class="pc-state pc-error">{{ error }}</div>
        <template v-else-if="result">
          <ul class="pc-list">
            <li v-for="item in sorted" :key="item.id" class="pc-item" :class="`pc-${item.status}`">
              <CheckCircle2 v-if="item.status === 'pass'" :size="16" class="pc-ico pass" />
              <AlertTriangle v-else-if="item.status === 'warn'" :size="16" class="pc-ico warn" />
              <XCircle v-else :size="16" class="pc-ico fail" />
              <span>{{ itemLabel(item) }}</span>
            </li>
          </ul>
        </template>
      </div>

      <div class="pc-footer" v-if="result && !loading">
        <span v-if="result.blocked" class="pc-verdict fail">
          {{ t("precheck.blocked") }}
        </span>
        <span v-else-if="result.warnings" class="pc-verdict warn">
          {{ t("precheck.warnings", { count: result.warnings }) }}
        </span>
        <span v-else class="pc-verdict pass">{{ t("precheck.all_good") }}</span>

        <div class="pc-actions">
          <button class="btn-cancel" @click="emit('close')">
            {{ t("common.cancel") }}
          </button>
          <button
            class="btn-send-now"
            :disabled="result.blocked"
            @click="emit('confirm')"
          >
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
  max-width: 560px;
  width: 95%;
  max-height: 85vh;
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
.pc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pc-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.83rem;
  line-height: 1.4;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.pc-item.pc-fail {
  background: rgba(248, 113, 113, 0.07);
}
.pc-item.pc-warn {
  background: rgba(251, 191, 36, 0.06);
}
.pc-ico {
  flex-shrink: 0;
  margin-top: 1px;
}
.pc-ico.pass { color: #34d399; }
.pc-ico.warn { color: #fbbf24; }
.pc-ico.fail { color: #f87171; }
.pc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-hi);
  flex-wrap: wrap;
}
.pc-verdict {
  font-size: 0.78rem;
  font-weight: 600;
}
.pc-verdict.pass { color: #34d399; }
.pc-verdict.warn { color: #fbbf24; }
.pc-verdict.fail { color: #f87171; }
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
</style>
