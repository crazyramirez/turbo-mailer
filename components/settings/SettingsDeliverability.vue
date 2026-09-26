<script setup lang="ts">
import { PlugZap, Loader2, Plus, Trash2 } from "lucide-vue-next";

const { t } = useI18n();
const { data, draftOf, save, saving, isSecretSet } = useSettings();
const { showToast } = useDashboardState();

const d = reactive(draftOf([
  "bounceAddress", "imapAutoDetect", "imapHost", "imapPort", "imapUser", "imapPass", "imapTls", "imapAllowInvalidCert", "inboundAutoProcess",
  "spamCheckUrl", "sunsetEnabled", "sunsetDays", "sunsetMinSends", "cbMinSample", "cbMaxHardBounceRate", "cbMaxBlockRate",
  "blocklistMonitor", "sendingIps", "doubleOptIn",
]));
for (const [k, v] of Object.entries({ imapAutoDetect: true, imapTls: true, inboundAutoProcess: true, blocklistMonitor: true })) {
  if (d[k] === "" || d[k] === null) d[k] = v;
}
// Breaker rates are stored as fractions; the UI shows percentages
const hardPct = ref(d.cbMaxHardBounceRate ? Number(d.cbMaxHardBounceRate) * 100 : 5);
const blockPct = ref(d.cbMaxBlockRate ? Number(d.cbMaxBlockRate) * 100 : 10);

function saveAll() {
  save({ ...d, cbMaxHardBounceRate: hardPct.value / 100, cbMaxBlockRate: blockPct.value / 100 });
}

const imapTest = ref<any>(null);
const testingImap = ref(false);
async function testImap() {
  testingImap.value = true;
  try {
    imapTest.value = await $fetch<any>("/api/settings/test-imap", { method: "POST" });
  } catch (e: any) {
    imapTest.value = { ok: false, error: e?.data?.statusMessage || e.message };
  } finally {
    testingImap.value = false;
  }
}

// Seed mailboxes for inbox placement tests
const seeds = ref<any[]>((data.value?.settings.seedMailboxes as any[]) ?? []);
function addSeed() {
  seeds.value.push({ id: "", email: "", label: "", imapHost: "", imapPort: 993, user: "", pass: "", tls: true });
}
async function saveSeeds() {
  const ok = await save({ seedMailboxes: seeds.value });
  if (ok) seeds.value = (data.value?.settings.seedMailboxes as any[]) ?? [];
}
function guessImap(s: any) {
  const dom = String(s.email).split("@")[1]?.toLowerCase() ?? "";
  if (s.imapHost) return;
  if (/gmail|googlemail/.test(dom)) s.imapHost = "imap.gmail.com";
  else if (/outlook|hotmail|live|msn/.test(dom)) s.imapHost = "outlook.office365.com";
  else if (/yahoo|ymail/.test(dom)) s.imapHost = "imap.mail.yahoo.com";
  else if (/icloud|me\.com/.test(dom)) s.imapHost = "imap.mail.me.com";
  else if (/gmx/.test(dom)) s.imapHost = "imap.gmx.com";
}
</script>

<template>
  <div class="tm-main" style="padding: 0">
    <div class="tm-grid-2">
      <section class="tm-card">
        <h3 class="tm-card-title">
          <span>{{ t("settings.deliv.inbound") }}</span>
          <button class="tm-btn tm-btn-sm" :disabled="testingImap" @click="testImap">
            <Loader2 v-if="testingImap" :size="12" class="tm-spin" /><PlugZap v-else :size="12" /> {{ t("settings.deliv.test_imap") }}
          </button>
        </h3>
        <p class="tm-hint">{{ t("settings.deliv.inbound_hint") }}</p>
        <div v-if="imapTest" class="tm-hint" :style="{ color: imapTest.ok ? '#34d399' : '#fb7185' }">
          {{ imapTest.ok ? t("settings.deliv.imap_ok", { host: imapTest.host, n: imapTest.folders?.length ?? 0 }) : `${imapTest.error}${imapTest.hint ? ' — ' + imapTest.hint : ''}` }}
        </div>
        <label class="tm-check"><input v-model="d.imapAutoDetect" type="checkbox" /> {{ t("settings.deliv.imap_auto") }}</label>
        <template v-if="!d.imapAutoDetect">
          <div class="tm-row">
            <div class="tm-field" style="flex: 2 1 200px"><label>Host IMAP</label><input v-model="d.imapHost" class="tm-input" /></div>
            <div class="tm-field" style="flex: 0 0 90px"><label>{{ t("settings.sending.port") }}</label><input v-model.number="d.imapPort" type="number" class="tm-input" placeholder="993" /></div>
          </div>
          <div class="tm-row">
            <div class="tm-field"><label>{{ t("settings.sending.user") }}</label><input v-model="d.imapUser" class="tm-input" /></div>
            <div class="tm-field"><label>{{ t("settings.sending.password") }}</label><input v-model="d.imapPass" type="password" class="tm-input" :placeholder="isSecretSet('imapPass') ? t('settings.keep_secret') : ''" autocomplete="new-password" /></div>
          </div>
          <label class="tm-check"><input v-model="d.imapTls" type="checkbox" /> TLS</label>
        </template>
        <label class="tm-check"><input v-model="d.imapAllowInvalidCert" type="checkbox" /> {{ t("settings.deliv.invalid_cert") }}</label>
        <label class="tm-check"><input v-model="d.inboundAutoProcess" type="checkbox" /> {{ t("settings.deliv.auto_process") }}</label>
        <div class="tm-field">
          <label>{{ t("settings.deliv.bounce_address") }}</label>
          <input v-model="d.bounceAddress" class="tm-input" type="email" placeholder="bounces@tudominio.com" />
          <p class="tm-hint">{{ t("settings.deliv.bounce_address_hint") }}</p>
        </div>
      </section>

      <section class="tm-card">
        <h3 class="tm-card-title">{{ t("settings.deliv.protection") }}</h3>
        <label class="tm-check"><input v-model="d.doubleOptIn" type="checkbox" /> {{ t("settings.deliv.double_opt_in") }}</label>
        <label class="tm-check"><input v-model="d.sunsetEnabled" type="checkbox" /> {{ t("settings.deliv.sunset") }}</label>
        <div v-if="d.sunsetEnabled" class="tm-row">
          <div class="tm-field"><label>{{ t("settings.deliv.sunset_days") }}</label><input v-model.number="d.sunsetDays" type="number" min="30" class="tm-input" placeholder="180" /></div>
          <div class="tm-field"><label>{{ t("settings.deliv.sunset_sends") }}</label><input v-model.number="d.sunsetMinSends" type="number" min="1" class="tm-input" placeholder="5" /></div>
        </div>
        <p class="tm-hint">{{ t("settings.deliv.sunset_hint") }}</p>
        <span class="tm-label">{{ t("settings.deliv.breaker") }}</span>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.deliv.breaker_bounce") }}</label><input v-model.number="hardPct" type="number" min="0.5" max="100" step="0.5" class="tm-input" /></div>
          <div class="tm-field"><label>{{ t("settings.deliv.breaker_block") }}</label><input v-model.number="blockPct" type="number" min="1" max="100" class="tm-input" /></div>
          <div class="tm-field"><label>{{ t("settings.deliv.breaker_sample") }}</label><input v-model.number="d.cbMinSample" type="number" min="10" class="tm-input" placeholder="50" /></div>
        </div>
        <p class="tm-hint">{{ t("settings.deliv.breaker_hint") }}</p>
        <div class="tm-field">
          <label>{{ t("settings.deliv.spam_url") }}</label>
          <input v-model="d.spamCheckUrl" class="tm-input" placeholder="http://rspamd:11333  ·  spamd://spamassassin:783" />
          <p class="tm-hint">{{ t("settings.deliv.spam_url_hint") }}</p>
        </div>
        <label class="tm-check"><input v-model="d.blocklistMonitor" type="checkbox" /> {{ t("settings.deliv.blocklist_monitor") }}</label>
        <div class="tm-field"><label>{{ t("settings.deliv.sending_ips") }}</label><input v-model="d.sendingIps" class="tm-input" placeholder="203.0.113.10, 203.0.113.11" /></div>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="saveAll">{{ t("settings.save") }}</button></div>
      </section>
    </div>

    <section class="tm-card">
      <h3 class="tm-card-title">
        <span>{{ t("settings.deliv.seeds") }}</span>
        <button class="tm-btn tm-btn-sm" @click="addSeed"><Plus :size="12" /> {{ t("settings.deliv.add_seed") }}</button>
      </h3>
      <p class="tm-hint">{{ t("settings.deliv.seeds_hint") }}</p>
      <div v-for="(s, i) in seeds" :key="i" class="tm-row seed-row">
        <div class="tm-field"><label>Email</label><input v-model="s.email" class="tm-input" type="email" @blur="guessImap(s)" /></div>
        <div class="tm-field"><label>Host IMAP</label><input v-model="s.imapHost" class="tm-input" /></div>
        <div class="tm-field"><label>{{ t("settings.deliv.app_password") }}</label><input v-model="s.pass" type="password" class="tm-input" :placeholder="s.passSet ? t('settings.keep_secret') : ''" autocomplete="new-password" /></div>
        <button class="tm-btn tm-btn-ghost tm-icon-btn" style="align-self: flex-end" @click="seeds.splice(i, 1)"><Trash2 :size="13" /></button>
      </div>
      <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="saveSeeds">{{ t("settings.save") }}</button></div>
    </section>
  </div>
</template>

<style scoped>
.seed-row {
  align-items: flex-end;
}
</style>
