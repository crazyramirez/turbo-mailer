<script setup lang="ts">
import { Plus, Pencil, Trash2, PlugZap, Loader2, X, KeyRound, Copy } from "lucide-vue-next";

const { t } = useI18n();
const { data, load, draftOf, save, saving } = useSettings();
const { showToast, showDialog } = useDashboardState();

const pace = reactive(draftOf([
  "smtpSendDelayMs", "smtpSendJitterMs", "smtpMaxEmailsPerSecond", "smtpConcurrency", "smtpMaxConnections",
  "smtpMaxRetries", "throttle_google", "throttle_microsoft", "throttle_yahoo", "throttle_apple", "throttle_other",
  "warmupEnabled", "warmupStartVolume", "warmupGrowthPct", "warmupMaxPerDay", "warmupStartDate", "unsubConfirmationEmail",
]));
if (pace.unsubConfirmationEmail === "") pace.unsubConfirmationEmail = true;

function savePace() {
  const patch: Record<string, unknown> = { ...pace };
  if (pace.warmupEnabled && !pace.warmupStartDate) patch.warmupStartDate = new Date().toISOString().slice(0, 10);
  save(patch);
}

// ── Senders (SMTP profiles) ───────────────────────────────────────────
const editing = ref<Record<string, any> | null>(null);
const busy = ref(false);
const testing = ref<string | null>(null);
const testTo = ref("");

function newSender() {
  editing.value = { id: "", name: "", host: "", port: 587, secure: false, user: "", pass: "", fromEmail: "", fromName: "", replyTo: "", dkimDomain: "", dkimSelector: "", dkimPrivateKey: "", maxPerSecond: 0, dailyLimit: 0, backup: true, priority: 10 };
}
function editSender(s: any) {
  editing.value = { ...s, pass: "", dkimPrivateKey: "" };
}

async function saveSender() {
  if (!editing.value) return;
  busy.value = true;
  try {
    await $fetch("/api/settings/senders", { method: "PUT", body: editing.value });
    editing.value = null;
    await load();
    showToast(t("settings.saved"), "success");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    busy.value = false;
  }
}

async function removeSender(s: any) {
  if (!(await showDialog({ type: "confirm", title: t("settings.sending.delete_sender"), message: s.name }))) return;
  try {
    await $fetch("/api/settings/senders", { method: "DELETE", query: { id: s.id } });
    await load();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}

async function testSender(s: any) {
  testing.value = s.id;
  try {
    const r = await $fetch<any>("/api/settings/test-smtp", { method: "POST", body: { id: s.id, to: testTo.value || undefined } });
    if (r.ok) showToast(testTo.value ? t("settings.sending.test_sent", { to: testTo.value }) : t("settings.sending.test_ok", { ms: r.connectMs }), "success");
    else showToast(`${r.stage === "send" ? t("settings.sending.test_send_failed") : t("settings.sending.test_failed")}: ${r.error}`, "error");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    testing.value = null;
  }
}

// ── DKIM key generator ────────────────────────────────────────────────
const dkim = ref<any>(null);
async function generateDkim() {
  if (!editing.value) return;
  try {
    dkim.value = await $fetch<any>("/api/settings/dkim", {
      method: "POST",
      body: { id: editing.value.id || "default", domain: editing.value.fromEmail?.split("@")[1] || editing.value.dkimDomain },
    });
    editing.value.dkimDomain = dkim.value.domain;
    editing.value.dkimSelector = dkim.value.selector;
    editing.value.dkimPrivateKey = dkim.value.privateKey;
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}
function copy(text: string) {
  navigator.clipboard?.writeText(text);
  showToast(t("settings.copied"), "info");
}
</script>

<template>
  <div class="tm-main" style="padding: 0">
    <section class="tm-card">
      <h3 class="tm-card-title">
        <span>{{ t("settings.sending.senders") }}</span>
        <button class="tm-btn tm-btn-sm" @click="newSender"><Plus :size="12" /> {{ t("settings.sending.add_sender") }}</button>
      </h3>
      <p class="tm-hint">{{ t("settings.sending.senders_hint") }}</p>
      <div class="tm-table-wrap">
        <table class="tm-table">
          <thead>
            <tr>
              <th>{{ t("settings.sending.name") }}</th><th>SMTP</th><th>{{ t("settings.sending.from") }}</th><th>DKIM</th><th>{{ t("settings.sending.role") }}</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in data?.senders" :key="s.id">
              <td><strong>{{ s.name }}</strong></td>
              <td class="tm-mono">{{ s.host }}:{{ s.port }}</td>
              <td>{{ s.fromName }} &lt;{{ s.fromEmail }}&gt;</td>
              <td><span class="tm-badge" :class="s.dkimConfigured ? 'ok' : 'warn'">{{ s.dkimConfigured ? s.dkimSelector : t("settings.sending.no_dkim") }}</span></td>
              <td><span class="tm-badge" :class="s.id === 'default' ? 'accent' : s.backup ? 'info' : ''">{{ s.id === "default" ? t("settings.sending.primary") : s.backup ? t("settings.sending.backup") : t("settings.sending.alternative") }}</span></td>
              <td class="num" style="white-space: nowrap">
                <button class="tm-btn tm-btn-sm tm-btn-ghost" :disabled="testing === s.id" :title="t('settings.sending.test')" @click="testSender(s)">
                  <Loader2 v-if="testing === s.id" :size="13" class="tm-spin" /><PlugZap v-else :size="13" />
                </button>
                <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.edit')" @click="editSender(s)"><Pencil :size="13" /></button>
                <button v-if="s.id !== 'default'" class="tm-btn tm-btn-sm tm-btn-ghost" @click="removeSender(s)"><Trash2 :size="13" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="tm-row" style="align-items: flex-end">
        <div class="tm-field">
          <label>{{ t("settings.sending.test_to") }}</label>
          <input v-model="testTo" class="tm-input" type="email" :placeholder="t('settings.sending.test_to_ph')" />
        </div>
      </div>
    </section>

    <div class="tm-grid-2">
      <section class="tm-card">
        <h3 class="tm-card-title">{{ t("settings.sending.pace") }}</h3>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.sending.delay") }}</label><input v-model.number="pace.smtpSendDelayMs" type="number" min="0" class="tm-input" /></div>
          <div class="tm-field"><label>{{ t("settings.sending.jitter") }}</label><input v-model.number="pace.smtpSendJitterMs" type="number" min="0" class="tm-input" /></div>
        </div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.sending.per_second") }}</label><input v-model.number="pace.smtpMaxEmailsPerSecond" type="number" min="0" step="0.1" class="tm-input" /></div>
          <div class="tm-field"><label>{{ t("settings.sending.concurrency") }}</label><input v-model.number="pace.smtpConcurrency" type="number" min="1" max="10" class="tm-input" /></div>
        </div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.sending.connections") }}</label><input v-model.number="pace.smtpMaxConnections" type="number" min="1" max="10" class="tm-input" /></div>
          <div class="tm-field"><label>{{ t("settings.sending.retries") }}</label><input v-model.number="pace.smtpMaxRetries" type="number" min="1" max="6" class="tm-input" /></div>
        </div>
        <p class="tm-hint">{{ t("settings.sending.pace_hint") }}</p>
        <span class="tm-label">{{ t("settings.sending.throttles") }}</span>
        <div class="tm-row">
          <div v-for="p in ['google', 'microsoft', 'yahoo', 'apple', 'other']" :key="p" class="tm-field" style="flex: 1 1 110px">
            <label>{{ t(`deliv.providers.${p}`) }}</label>
            <input v-model.number="pace[`throttle_${p}`]" type="number" min="0" class="tm-input" :placeholder="t('settings.sending.no_limit')" />
          </div>
        </div>
        <p class="tm-hint">{{ t("settings.sending.throttles_hint") }}</p>
        <label class="tm-check"><input v-model="pace.unsubConfirmationEmail" type="checkbox" /> {{ t("settings.sending.unsub_email") }}</label>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="savePace">{{ t("settings.save") }}</button></div>
      </section>

      <section class="tm-card">
        <h3 class="tm-card-title">{{ t("settings.sending.warmup") }}</h3>
        <label class="tm-check"><input v-model="pace.warmupEnabled" type="checkbox" /> {{ t("settings.sending.warmup_on") }}</label>
        <p class="tm-hint">{{ t("settings.sending.warmup_hint") }}</p>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.sending.warmup_start") }}</label><input v-model.number="pace.warmupStartVolume" type="number" min="1" class="tm-input" placeholder="50" /></div>
          <div class="tm-field"><label>{{ t("settings.sending.warmup_growth") }}</label><input v-model.number="pace.warmupGrowthPct" type="number" min="1" max="200" class="tm-input" placeholder="30" /></div>
        </div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.sending.warmup_max") }}</label><input v-model.number="pace.warmupMaxPerDay" type="number" min="1" class="tm-input" placeholder="50000" /></div>
          <div class="tm-field"><label>{{ t("settings.sending.warmup_date") }}</label><input v-model="pace.warmupStartDate" type="date" class="tm-input" /></div>
        </div>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="savePace">{{ t("settings.save") }}</button></div>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="editing" class="tm-modal-backdrop" @click.self="editing = null">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head">
            <h2>{{ editing.id ? t("settings.sending.edit_sender") : t("settings.sending.add_sender") }}</h2>
            <button class="tm-btn tm-btn-ghost tm-icon-btn" @click="editing = null"><X :size="16" /></button>
          </div>
          <div class="tm-modal-body">
            <div v-if="editing.id !== 'default'" class="tm-field"><label>{{ t("settings.sending.name") }}</label><input v-model="editing.name" class="tm-input" placeholder="Amazon SES, Brevo..." /></div>
            <div class="tm-row">
              <div class="tm-field" style="flex: 2 1 220px"><label>Host SMTP</label><input v-model="editing.host" class="tm-input" placeholder="smtp.proveedor.com" /></div>
              <div class="tm-field" style="flex: 0 0 90px"><label>{{ t("settings.sending.port") }}</label><input v-model.number="editing.port" type="number" class="tm-input" /></div>
            </div>
            <label class="tm-check"><input v-model="editing.secure" type="checkbox" /> {{ t("settings.sending.secure") }}</label>
            <div class="tm-row">
              <div class="tm-field"><label>{{ t("settings.sending.user") }}</label><input v-model="editing.user" class="tm-input" autocomplete="off" /></div>
              <div class="tm-field"><label>{{ t("settings.sending.password") }}</label><input v-model="editing.pass" type="password" class="tm-input" autocomplete="new-password" :placeholder="editing.id ? t('settings.keep_secret') : ''" /></div>
            </div>
            <div class="tm-row">
              <div class="tm-field"><label>{{ t("settings.sending.from_name") }}</label><input v-model="editing.fromName" class="tm-input" /></div>
              <div class="tm-field"><label>{{ t("settings.sending.from_email") }}</label><input v-model="editing.fromEmail" type="email" class="tm-input" /></div>
            </div>
            <div class="tm-field"><label>{{ t("settings.sending.reply_to") }}</label><input v-model="editing.replyTo" type="email" class="tm-input" /></div>
            <span class="tm-label"><KeyRound :size="12" /> DKIM</span>
            <div class="tm-row">
              <div class="tm-field"><label>{{ t("settings.sending.dkim_domain") }}</label><input v-model="editing.dkimDomain" class="tm-input" /></div>
              <div class="tm-field"><label>{{ t("settings.sending.dkim_selector") }}</label><input v-model="editing.dkimSelector" class="tm-input" /></div>
            </div>
            <div class="tm-field">
              <label>{{ t("settings.sending.dkim_key") }}</label>
              <textarea v-model="editing.dkimPrivateKey" class="tm-textarea tm-mono" rows="3" :placeholder="editing.dkimConfigured ? t('settings.keep_secret') : '-----BEGIN PRIVATE KEY-----'"></textarea>
              <button class="tm-btn tm-btn-sm" type="button" @click="generateDkim">{{ t("settings.sending.dkim_generate") }}</button>
            </div>
            <div v-if="dkim" class="tm-field">
              <label>{{ t("settings.sending.dkim_publish") }}</label>
              <pre class="tm-pre">{{ dkim.dnsName }}  TXT  "{{ dkim.dnsValue }}"</pre>
              <button class="tm-btn tm-btn-sm" type="button" @click="copy(dkim.dnsValue)"><Copy :size="12" /> {{ t("settings.copy") }}</button>
            </div>
            <template v-if="editing.id !== 'default'">
              <div class="tm-row">
                <div class="tm-field"><label>{{ t("settings.sending.max_per_second") }}</label><input v-model.number="editing.maxPerSecond" type="number" min="0" step="0.1" class="tm-input" /></div>
                <div class="tm-field"><label>{{ t("settings.sending.daily_limit") }}</label><input v-model.number="editing.dailyLimit" type="number" min="0" class="tm-input" /></div>
              </div>
              <label class="tm-check"><input v-model="editing.backup" type="checkbox" /> {{ t("settings.sending.use_as_backup") }}</label>
            </template>
            <div v-else class="tm-field"><label>{{ t("settings.sending.daily_limit") }}</label><input v-model.number="editing.dailyLimit" type="number" min="0" class="tm-input" /></div>
          </div>
          <div class="tm-modal-foot">
            <button class="tm-btn" @click="editing = null">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="busy || !editing.host || !editing.user" @click="saveSender">{{ t("settings.save") }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
