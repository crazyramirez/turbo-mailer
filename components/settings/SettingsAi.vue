<script setup lang="ts">
import { PlugZap, Loader2, Sparkles } from "lucide-vue-next";

const { t } = useI18n();
const { draftOf, save, saving, isSecretSet } = useSettings();
const { showToast } = useDashboardState();

const d = reactive(draftOf(["aiProvider", "anthropicApiKey", "anthropicModel", "openaiApiKey", "openaiModel", "aiBaseUrl", "aiApiKey", "aiModel"]));
if (!d.aiProvider) d.aiProvider = isSecretSet("anthropicApiKey") ? "anthropic" : isSecretSet("openaiApiKey") ? "openai" : "anthropic";

const status = ref<any>(null);
const testing = ref(false);
async function refresh() {
  status.value = await $fetch<any>("/api/ai/status").catch(() => null);
}
async function saveAndTest() {
  if (!(await save({ ...d }))) return;
  testing.value = true;
  try {
    const r = await $fetch<any>("/api/settings/test-ai", { method: "POST" });
    showToast(r.ok ? t("settings.ai.test_ok", { provider: r.provider, model: r.model, ms: r.ms }) : `${t("settings.ai.test_failed")}: ${r.error}`, r.ok ? "success" : "error");
  } finally {
    testing.value = false;
    refresh();
  }
}
onMounted(refresh);

const fmt = (n: number) => new Intl.NumberFormat().format(n || 0);
</script>

<template>
  <div class="tm-grid-2">
    <section class="tm-card">
      <h3 class="tm-card-title"><span class="tm-title-left"><Sparkles :size="14" /> {{ t("settings.ai.provider") }}</span></h3>
      <div class="ai-choice">
        <label v-for="p in ['anthropic', 'openai', 'compatible']" :key="p" class="ai-opt" :class="{ on: d.aiProvider === p }">
          <input v-model="d.aiProvider" type="radio" :value="p" />
          <strong>{{ t(`settings.ai.p_${p}`) }}</strong>
          <small>{{ t(`settings.ai.p_${p}_hint`) }}</small>
        </label>
      </div>

      <template v-if="d.aiProvider === 'anthropic'">
        <div class="tm-field">
          <label>Anthropic API key</label>
          <input v-model="d.anthropicApiKey" type="password" class="tm-input" autocomplete="off" :placeholder="isSecretSet('anthropicApiKey') ? t('settings.keep_secret') : 'sk-ant-…'" />
        </div>
        <div class="tm-field">
          <label>{{ t("settings.ai.model") }}</label>
          <input v-model="d.anthropicModel" class="tm-input" placeholder="claude-opus-5" list="claude-models" />
          <datalist id="claude-models">
            <option value="claude-opus-5" />
            <option value="claude-sonnet-5" />
            <option value="claude-haiku-4-5" />
          </datalist>
          <p class="tm-hint">{{ t("settings.ai.claude_hint") }}</p>
        </div>
      </template>
      <template v-else-if="d.aiProvider === 'openai'">
        <div class="tm-field">
          <label>OpenAI API key</label>
          <input v-model="d.openaiApiKey" type="password" class="tm-input" autocomplete="off" :placeholder="isSecretSet('openaiApiKey') ? t('settings.keep_secret') : 'sk-…'" />
        </div>
        <div class="tm-field"><label>{{ t("settings.ai.model") }}</label><input v-model="d.openaiModel" class="tm-input" placeholder="gpt-4o-mini" /></div>
      </template>
      <template v-else>
        <div class="tm-field">
          <label>{{ t("settings.ai.base_url") }}</label>
          <input v-model="d.aiBaseUrl" class="tm-input" placeholder="http://localhost:11434/v1" />
          <p class="tm-hint">{{ t("settings.ai.base_url_hint") }}</p>
        </div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.ai.model") }}</label><input v-model="d.aiModel" class="tm-input" placeholder="llama3.1" /></div>
          <div class="tm-field"><label>API key ({{ t("settings.optional") }})</label><input v-model="d.aiApiKey" type="password" class="tm-input" :placeholder="isSecretSet('aiApiKey') ? t('settings.keep_secret') : ''" /></div>
        </div>
      </template>

      <div class="tm-actions">
        <button class="tm-btn tm-btn-primary" :disabled="saving || testing" @click="saveAndTest">
          <Loader2 v-if="testing" :size="13" class="tm-spin" /><PlugZap v-else :size="13" /> {{ t("settings.ai.save_test") }}
        </button>
      </div>
    </section>

    <section class="tm-card">
      <h3 class="tm-card-title">{{ t("settings.ai.status") }}</h3>
      <ul class="tm-check-list" v-if="status">
        <li><span class="tm-dot" :class="status.configured ? 'ok' : 'bad'" />{{ status.configured ? t("settings.ai.active", { provider: status.provider, model: status.model }) : t("settings.ai.inactive") }}</li>
        <li><span class="tm-dot info" />{{ t("settings.ai.usage", { calls: fmt(status.usage.calls), input: fmt(status.usage.input), output: fmt(status.usage.output) }) }}</li>
      </ul>
      <p class="tm-hint">{{ t("settings.ai.features") }}</p>
    </section>
  </div>
</template>

<style scoped>
.ai-choice {
  display: grid;
  gap: 8px;
}
.ai-opt {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
}
.ai-opt input {
  grid-row: span 2;
  accent-color: var(--accent2);
}
.ai-opt small {
  color: var(--text-muted);
  font-size: 11.5px;
}
.ai-opt.on {
  border-color: rgba(129, 140, 248, 0.6);
  background: rgba(99, 102, 241, 0.08);
}
</style>
