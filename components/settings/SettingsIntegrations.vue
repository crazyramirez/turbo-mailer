<script setup lang="ts">
import { KeyRound, Plus, Copy, Ban, Webhook, BellRing, X } from "lucide-vue-next";

const { t } = useI18n();
const { draftOf, save, saving, isSecretSet } = useSettings();
const { showToast, showDialog } = useDashboardState();

const d = reactive(draftOf(["webhookUrl", "webhookSecret", "alertSlackWebhook", "alertTelegramToken", "alertTelegramChatId", "alertEmail", "turnstileSiteKey", "turnstileSecret", "metricsToken"]));

const keys = ref<{ scopes: string[]; keys: any[] }>({ scopes: [], keys: [] });
async function loadKeys() {
  keys.value = await $fetch<{ scopes: string[]; keys: any[] }>("/api/settings/api-keys");
}
onMounted(loadKeys);

const creating = ref<{ name: string; scopes: string[] } | null>(null);
const newKey = ref<string | null>(null);
async function createKey() {
  if (!creating.value) return;
  try {
    const r = await $fetch<any>("/api/settings/api-keys", { method: "POST", body: creating.value });
    newKey.value = r.key;
    creating.value = null;
    loadKeys();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}
async function revoke(k: any) {
  if (!(await showDialog({ type: "confirm", title: t("settings.integ.revoke"), message: `${k.name} (${k.prefix}…)` }))) return;
  await $fetch("/api/settings/api-keys", { method: "DELETE", query: { id: k.id } });
  loadKeys();
}
function copy(text: string) {
  navigator.clipboard?.writeText(text);
  showToast(t("settings.copied"), "info");
}
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");
const base = computed(() => (typeof window !== "undefined" ? window.location.origin : ""));
// Kept in script: merge tags ("{{order}}") can't appear inside a template mustache
const curlExamples = computed(() => [
  `curl -X POST ${base.value}/api/v1/send \\`,
  `  -H "Authorization: Bearer tm_…" -H "Idempotency-Key: pedido-1234" \\`,
  `  -H "Content-Type: application/json" \\`,
  `  -d '{"to":"cliente@ejemplo.com","subject":"Tu pedido {{order}}","template":"pedido","variables":{"order":"A-17"}}'`,
  "",
  `curl -X POST ${base.value}/api/v1/contacts -H "Authorization: Bearer tm_…" \\`,
  `  -d '{"email":"ana@ejemplo.com","name":"Ana","listIds":[1],"tags":["web"]}'`,
  "",
  `curl -X POST ${base.value}/api/v1/events -H "Authorization: Bearer tm_…" \\`,
  `  -d '{"email":"ana@ejemplo.com","event":"order.completed","data":{"total":49}}'`,
].join("\n"));
</script>

<template>
  <div class="tm-main" style="padding: 0">
    <section class="tm-card">
      <h3 class="tm-card-title">
        <span class="tm-title-left"><KeyRound :size="14" /> {{ t("settings.integ.api_keys") }}</span>
        <button class="tm-btn tm-btn-sm" @click="creating = { name: '', scopes: ['send'] }"><Plus :size="12" /> {{ t("settings.integ.new_key") }}</button>
      </h3>
      <p class="tm-hint">{{ t("settings.integ.api_hint", { base }) }}</p>
      <div v-if="newKey" class="new-key">
        <strong>{{ t("settings.integ.key_once") }}</strong>
        <pre class="tm-pre">{{ newKey }}</pre>
        <div class="tm-actions">
          <button class="tm-btn tm-btn-sm" @click="copy(newKey)"><Copy :size="12" /> {{ t("settings.copy") }}</button>
          <button class="tm-btn tm-btn-sm tm-btn-ghost" @click="newKey = null">{{ t("settings.integ.done") }}</button>
        </div>
      </div>
      <div class="tm-table-wrap">
        <div v-if="!keys.keys.length" class="tm-empty">{{ t("settings.integ.no_keys") }}</div>
        <table v-else class="tm-table">
          <thead><tr><th>{{ t("settings.sending.name") }}</th><th>{{ t("settings.integ.key") }}</th><th>{{ t("settings.integ.scopes") }}</th><th>{{ t("settings.integ.last_used") }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="k in keys.keys" :key="k.id" :style="k.revokedAt ? 'opacity:.5' : ''">
              <td>{{ k.name }}</td>
              <td class="tm-mono">{{ k.prefix }}…</td>
              <td><span v-for="s in k.scopes" :key="s" class="tm-badge" style="margin-right: 4px">{{ s }}</span></td>
              <td class="tm-muted">{{ k.revokedAt ? t("settings.integ.revoked") : fmtDate(k.lastUsedAt) }}</td>
              <td class="num"><button v-if="!k.revokedAt" class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('settings.integ.revoke')" @click="revoke(k)"><Ban :size="13" /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <details class="api-doc">
        <summary>{{ t("settings.integ.examples") }}</summary>
        <pre class="tm-pre">{{ curlExamples }}</pre>
      </details>
    </section>

    <div class="tm-grid-2">
      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><Webhook :size="14" /> Webhooks</span></h3>
        <p class="tm-hint">{{ t("settings.integ.webhook_hint") }}</p>
        <div class="tm-field"><label>URL</label><input v-model="d.webhookUrl" class="tm-input" placeholder="https://tu-app.com/hooks/turbomailer" /></div>
        <div class="tm-field"><label>{{ t("settings.integ.webhook_secret") }}</label><input v-model="d.webhookSecret" type="password" class="tm-input" :placeholder="isSecretSet('webhookSecret') ? t('settings.keep_secret') : ''" /></div>
        <span class="tm-label">{{ t("settings.integ.captcha") }}</span>
        <div class="tm-row">
          <div class="tm-field"><label>Turnstile site key</label><input v-model="d.turnstileSiteKey" class="tm-input" /></div>
          <div class="tm-field"><label>Turnstile secret</label><input v-model="d.turnstileSecret" type="password" class="tm-input" :placeholder="isSecretSet('turnstileSecret') ? t('settings.keep_secret') : ''" /></div>
        </div>
        <div class="tm-field">
          <label>{{ t("settings.integ.metrics_token") }}</label>
          <input v-model="d.metricsToken" type="password" class="tm-input" :placeholder="isSecretSet('metricsToken') ? t('settings.keep_secret') : ''" />
          <p class="tm-hint">{{ t("settings.integ.metrics_hint", { base }) }}</p>
        </div>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="save({ ...d })">{{ t("settings.save") }}</button></div>
      </section>

      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><BellRing :size="14" /> {{ t("settings.integ.alerts") }}</span></h3>
        <p class="tm-hint">{{ t("settings.integ.alerts_hint") }}</p>
        <div class="tm-field"><label>Slack (Incoming Webhook URL)</label><input v-model="d.alertSlackWebhook" class="tm-input" /></div>
        <div class="tm-row">
          <div class="tm-field"><label>Telegram bot token</label><input v-model="d.alertTelegramToken" type="password" class="tm-input" :placeholder="isSecretSet('alertTelegramToken') ? t('settings.keep_secret') : ''" /></div>
          <div class="tm-field"><label>Telegram chat ID</label><input v-model="d.alertTelegramChatId" class="tm-input" /></div>
        </div>
        <div class="tm-field"><label>Email</label><input v-model="d.alertEmail" type="email" class="tm-input" /></div>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="save({ ...d })">{{ t("settings.save") }}</button></div>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="creating" class="tm-modal-backdrop" @click.self="creating = null">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head"><h2>{{ t("settings.integ.new_key") }}</h2><button class="tm-btn tm-btn-ghost tm-icon-btn" @click="creating = null"><X :size="16" /></button></div>
          <div class="tm-modal-body">
            <div class="tm-field"><label>{{ t("settings.sending.name") }}</label><input v-model="creating.name" class="tm-input" :placeholder="t('settings.integ.key_name_ph')" /></div>
            <span class="tm-label">{{ t("settings.integ.scopes") }}</span>
            <label v-for="s in keys.scopes" :key="s" class="tm-check"><input v-model="creating.scopes" type="checkbox" :value="s" /> <code>{{ s }}</code> — {{ t(`settings.integ.scope_${s.replace(':', '_')}`) }}</label>
          </div>
          <div class="tm-modal-foot">
            <button class="tm-btn" @click="creating = null">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="!creating.name || !creating.scopes.length" @click="createKey">{{ t("settings.integ.create") }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.new-key {
  border: 1px solid rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.06);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
}
.api-doc summary {
  cursor: pointer;
  font-size: 12.5px;
  color: var(--accent-light);
}
.api-doc pre {
  margin-top: 8px;
}
</style>
