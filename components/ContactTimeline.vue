<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Send, Eye, MousePointerClick, AlertTriangle, XCircle, Loader2, History } from "lucide-vue-next";
const { t, locale } = useI18n();

const props = defineProps<{ contactId: number }>();

interface Entry {
  type: "sent" | "failed" | "bounced" | "open" | "click";
  at: string | null;
  campaignName: string;
  detail?: string | null;
}
interface Timeline {
  entries: Entry[];
  stats: { sent: number; opens: number; clicks: number; bounced: number };
}

const loading = ref(true);
const data = ref<Timeline | null>(null);

onMounted(async () => {
  try {
    data.value = await $fetch<Timeline>(`/api/contacts/${props.contactId}/timeline`);
  } catch {
    data.value = null;
  } finally {
    loading.value = false;
  }
});

const ICONS = { sent: Send, open: Eye, click: MousePointerClick, failed: AlertTriangle, bounced: XCircle };

function fmtDate(at: string | null): string {
  if (!at) return "—";
  return new Date(at).toLocaleString(locale.value === "es" ? "es-ES" : "en-US", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
</script>

<template>
  <div class="ct-wrap">
    <div class="ct-title">
      <History :size="14" />
      {{ t("timeline.title") }}
    </div>

    <div v-if="loading" class="ct-state"><Loader2 :size="16" class="spin" /></div>

    <template v-else-if="data">
      <div class="ct-stats">
        <span><Send :size="12" /> {{ data.stats.sent }} {{ t("timeline.sent") }}</span>
        <span><Eye :size="12" /> {{ data.stats.opens }} {{ t("timeline.opens") }}</span>
        <span><MousePointerClick :size="12" /> {{ data.stats.clicks }} {{ t("timeline.clicks") }}</span>
        <span v-if="data.stats.bounced" class="ct-bounced">
          <XCircle :size="12" /> {{ data.stats.bounced }} {{ t("timeline.bounced") }}
        </span>
      </div>

      <div v-if="data.entries.length === 0" class="ct-state">
        {{ t("timeline.empty") }}
      </div>
      <ul v-else class="ct-list">
        <li v-for="(e, i) in data.entries.slice(0, 30)" :key="i" class="ct-item" :class="`ct-${e.type}`">
          <component :is="ICONS[e.type]" :size="13" class="ct-ico" />
          <div class="ct-body">
            <span class="ct-label">{{ t(`timeline.type_${e.type}`) }} · {{ e.campaignName }}</span>
            <span v-if="e.type === 'click' && e.detail" class="ct-detail">{{ e.detail }}</span>
            <span v-else-if="(e.type === 'failed' || e.type === 'bounced') && e.detail" class="ct-detail">{{ e.detail }}</span>
          </div>
          <span class="ct-date">{{ fmtDate(e.at) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.ct-wrap {
  border-top: 1px solid var(--border-hi, rgba(255, 255, 255, 0.08));
  padding-top: 14px;
  margin-top: 4px;
}
.ct-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-dim, #8b8fa3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 10px;
}
.ct-state {
  display: flex;
  justify-content: center;
  padding: 14px 0;
  color: var(--text-dim, #8b8fa3);
  font-size: 0.8rem;
}
.ct-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.75rem;
  color: var(--text-dim, #c9cbe0);
  margin-bottom: 10px;
}
.ct-stats span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.ct-bounced { color: #f87171; }
.ct-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ct-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  font-size: 0.76rem;
}
.ct-ico { flex-shrink: 0; margin-top: 2px; }
.ct-sent .ct-ico { color: #60a5fa; }
.ct-open .ct-ico { color: #34d399; }
.ct-click .ct-ico { color: #a78bfa; }
.ct-failed .ct-ico { color: #fbbf24; }
.ct-bounced .ct-ico, .ct-item.ct-bounced .ct-ico { color: #f87171; }
.ct-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}
.ct-label { color: var(--text, #e5e7f0); }
.ct-detail {
  color: var(--text-dim, #8b8fa3);
  font-size: 0.7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ct-date {
  flex-shrink: 0;
  color: var(--text-dim, #8b8fa3);
  font-size: 0.7rem;
  margin-top: 2px;
}
.spin { animation: ct-spin 1s linear infinite; }
@keyframes ct-spin { to { transform: rotate(360deg); } }
</style>
