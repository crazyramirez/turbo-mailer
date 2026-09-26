<script setup lang="ts">
import { Sparkles, Send, Loader2, Trash2 } from "lucide-vue-next";
import MiniChart from "~/components/analytics/MiniChart.vue";

// "Ask your data": the model only sees aggregated numbers computed on the
// server — no SQL is generated from the question.
const { t } = useI18n();
const { can } = useMe();

interface AskChart { kind: "none" | "bar" | "line"; title: string; labels: string[]; values: number[] }
interface Msg { role: "user" | "assistant"; content: string; chart?: AskChart }

const available = ref(false);
const messages = ref<Msg[]>([]);
const question = ref("");
const busy = ref(false);
const error = ref("");

onMounted(async () => {
  const st = await $fetch<{ configured: boolean }>("/api/ai/status").catch(() => null);
  available.value = !!st?.configured;
});

const SUGGESTIONS = computed(() => [t("ask.s1"), t("ask.s2"), t("ask.s3"), t("ask.s4")]);

async function ask(q?: string) {
  const text = (q ?? question.value).trim();
  if (!text || busy.value) return;
  error.value = "";
  const history = messages.value.map(({ role, content }) => ({ role, content }));
  messages.value.push({ role: "user", content: text });
  question.value = "";
  busy.value = true;
  try {
    const r = await $fetch<{ answer: string; chart: AskChart }>("/api/ai/ask", { method: "POST", body: { question: text, history } });
    messages.value.push({ role: "assistant", content: r.answer, chart: r.chart?.kind !== "none" && r.chart?.values?.length ? r.chart : undefined });
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e.message;
    messages.value.pop();
    question.value = text;
  } finally {
    busy.value = false;
  }
}

// Minimal, safe markdown: escape everything, then **bold** and "- " lists
function render(md: string): string {
  const esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc.split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const li = line.match(/^\s*[-•*]\s+(.*)$/);
    if (li) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${li[1]}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (line.trim()) html += `<p>${line}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

</script>

<template>
  <section v-if="available && can('editor')" class="ask">
    <div class="ask-head">
      <span><Sparkles :size="15" /> {{ t("ask.title") }}</span>
      <button v-if="messages.length" class="ask-clear" :title="t('ask.clear')" @click="messages = []"><Trash2 :size="13" /></button>
    </div>

    <div v-if="!messages.length" class="ask-suggestions">
      <button v-for="s in SUGGESTIONS" :key="s" class="ask-chip" @click="ask(s)">{{ s }}</button>
    </div>

    <div v-else class="ask-thread">
      <div v-for="(m, i) in messages" :key="i" class="ask-msg" :class="m.role">
        <div v-if="m.role === 'user'" class="ask-bubble">{{ m.content }}</div>
        <div v-else class="ask-answer">
          <!-- render() escapes the model's text before adding <strong>/<ul> -->
          <div class="ask-md" v-html="render(m.content)" />
          <div v-if="m.chart" class="ask-chart">
            <span class="ask-chart-title">{{ m.chart.title }}</span>
            <div class="ask-chart-box">
              <MiniChart :kind="m.chart.kind === 'line' ? 'line' : 'bar'" :labels="m.chart.labels" :values="m.chart.values" :label="m.chart.title" />
            </div>
          </div>
        </div>
      </div>
      <div v-if="busy" class="ask-msg assistant"><div class="ask-answer thinking"><Loader2 :size="14" class="spin" /> {{ t("ask.thinking") }}</div></div>
    </div>

    <p v-if="error" class="ask-error">{{ error }}</p>
    <form class="ask-input" @submit.prevent="ask()">
      <input v-model="question" :placeholder="t('ask.placeholder')" maxlength="1000" :disabled="busy" />
      <button type="submit" :disabled="busy || !question.trim()"><Send :size="14" /></button>
    </form>
  </section>
</template>

<style scoped>
.ask {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  margin-bottom: 20px;
  border-radius: 20px;
  border: 1px solid rgba(129, 140, 248, 0.25);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.09), rgba(236, 72, 153, 0.05));
}
.ask-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.ask-head > span {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.ask-clear {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}
.ask-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ask-chip {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12.5px;
  cursor: pointer;
}
.ask-chip:hover {
  border-color: rgba(129, 140, 248, 0.6);
}
.ask-thread {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 520px;
  overflow-y: auto;
}
.ask-msg.user {
  display: flex;
  justify-content: flex-end;
}
.ask-bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 14px 14px 4px 14px;
  background: rgba(99, 102, 241, 0.35);
  font-size: 13px;
}
.ask-answer {
  font-size: 13.5px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.9);
}
.ask-answer.thinking {
  display: flex;
  gap: 8px;
  align-items: center;
  color: rgba(255, 255, 255, 0.55);
}
.ask-md :deep(p) {
  margin: 0 0 6px;
}
.ask-md :deep(ul) {
  margin: 0 0 6px;
  padding-left: 18px;
}
.ask-chart {
  margin-top: 8px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
}
.ask-chart-title {
  font-size: 11.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
}
.ask-chart-box {
  height: 200px;
}
.ask-error {
  margin: 0;
  font-size: 12px;
  color: #fb7185;
}
.ask-input {
  display: flex;
  gap: 8px;
}
.ask-input input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  font-size: 13.5px;
}
.ask-input input:focus {
  outline: none;
  border-color: rgba(129, 140, 248, 0.7);
}
.ask-input button {
  padding: 0 14px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  cursor: pointer;
}
.ask-input button:disabled {
  opacity: 0.5;
  cursor: default;
}
.spin {
  animation: ask-spin 0.9s linear infinite;
}
@keyframes ask-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
