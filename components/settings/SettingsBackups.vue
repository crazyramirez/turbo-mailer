<script setup lang="ts">
import { DatabaseBackup, Cloud, Download, Upload, Play, Loader2, RotateCcw } from "lucide-vue-next";

const { t } = useI18n();
const { draftOf, save, saving, isSecretSet } = useSettings();
const { showToast, showDialog } = useDashboardState();

const d = reactive(draftOf(["backupEnabled", "backupKeepLocal", "backupPassphrase", "s3Endpoint", "s3Region", "s3Bucket", "s3AccessKey", "s3SecretKey", "s3Retention"]));
if (d.backupEnabled === "" || d.backupEnabled === null) d.backupEnabled = true;

const info = ref<any>(null);
const running = ref(false);
async function refresh() {
  info.value = await $fetch<any>("/api/settings/backups").catch(() => null);
}
onMounted(refresh);

async function saveAll() {
  if (await save({ ...d })) refresh();
}

async function runNow() {
  running.value = true;
  try {
    const r = await $fetch<any>("/api/settings/backups", { method: "POST" });
    showToast(r.remote ? t("settings.backups.done_remote") : t("settings.backups.done_local"), "success");
    refresh();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    running.value = false;
  }
}

const fileInput = ref<HTMLInputElement>();
const withFiles = ref(true);
const restoring = ref(false);
const restoreResult = ref<any>(null);
async function restore(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = "";
  if (!file) return;
  const ok = await showDialog({ type: "confirm", title: t("settings.backups.restore_title"), message: t("settings.backups.restore_confirm", { name: file.name }) });
  if (!ok) return;
  restoring.value = true;
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("withFiles", String(withFiles.value));
    restoreResult.value = await $fetch<any>("/api/settings/backups/restore", { method: "POST", body: fd });
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    restoring.value = false;
  }
}

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtDate = (s: string | number | null) => (s ? new Date(s).toLocaleString() : "—");
</script>

<template>
  <div class="tm-main" style="padding: 0">
    <div class="tm-grid-2">
      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><DatabaseBackup :size="14" /> {{ t("settings.backups.schedule") }}</span></h3>
        <label class="tm-check"><input v-model="d.backupEnabled" type="checkbox" /> {{ t("settings.backups.enabled") }}</label>
        <div class="tm-field"><label>{{ t("settings.backups.keep_local") }}</label><input v-model.number="d.backupKeepLocal" type="number" min="1" max="100" class="tm-input" placeholder="10" /></div>
        <div class="tm-field">
          <label>{{ t("settings.backups.passphrase") }}</label>
          <input v-model="d.backupPassphrase" type="password" class="tm-input" autocomplete="new-password" :placeholder="isSecretSet('backupPassphrase') ? t('settings.keep_secret') : ''" />
          <p class="tm-hint">{{ t("settings.backups.passphrase_hint") }}</p>
        </div>
        <p class="tm-hint">{{ t("settings.backups.contents") }}</p>
        <ul v-if="info?.job" class="tm-check-list">
          <li><span class="tm-dot" :class="info.job.lastError ? 'bad' : info.job.lastRunAt ? 'ok' : 'warn'" />
            {{ info.job.lastRunAt ? t("settings.backups.last_run", { date: fmtDate(info.job.lastRunAt) }) : t("settings.backups.never") }}
            <span v-if="info.job.lastError" class="tm-muted"> — {{ info.job.lastError }}</span></li>
        </ul>
        <div class="tm-actions">
          <button class="tm-btn" :disabled="running" @click="runNow"><Loader2 v-if="running" :size="13" class="tm-spin" /><Play v-else :size="13" /> {{ t("settings.backups.run_now") }}</button>
          <button class="tm-btn tm-btn-primary" :disabled="saving" @click="saveAll">{{ t("settings.save") }}</button>
        </div>
      </section>

      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><Cloud :size="14" /> {{ t("settings.backups.offsite") }}</span>
          <span class="tm-badge" :class="info?.s3Configured ? 'ok' : ''">{{ info?.s3Configured ? t("settings.backups.s3_on") : t("settings.backups.s3_off") }}</span>
        </h3>
        <p class="tm-hint">{{ t("settings.backups.s3_hint") }}</p>
        <div class="tm-field"><label>Endpoint</label><input v-model="d.s3Endpoint" class="tm-input" placeholder="https://s3.eu-west-1.amazonaws.com · https://<account>.r2.cloudflarestorage.com" /></div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.backups.region") }}</label><input v-model="d.s3Region" class="tm-input" placeholder="auto" /></div>
          <div class="tm-field"><label>Bucket</label><input v-model="d.s3Bucket" class="tm-input" /></div>
        </div>
        <div class="tm-row">
          <div class="tm-field"><label>Access key</label><input v-model="d.s3AccessKey" class="tm-input" autocomplete="off" /></div>
          <div class="tm-field"><label>Secret key</label><input v-model="d.s3SecretKey" type="password" class="tm-input" autocomplete="new-password" :placeholder="isSecretSet('s3SecretKey') ? t('settings.keep_secret') : ''" /></div>
        </div>
        <div class="tm-field"><label>{{ t("settings.backups.retention") }}</label><input v-model.number="d.s3Retention" type="number" min="1" max="365" class="tm-input" placeholder="30" /></div>
        <p v-if="info?.remoteError" class="tm-hint" style="color: #fb7185">{{ info.remoteError }}</p>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="saveAll">{{ t("settings.save") }}</button></div>
      </section>
    </div>

    <div class="tm-grid-2">
      <section class="tm-card">
        <h3 class="tm-card-title">{{ t("settings.backups.local_list") }}</h3>
        <div class="tm-table-wrap">
          <div v-if="!info?.local?.length" class="tm-empty">{{ t("settings.backups.none") }}</div>
          <table v-else class="tm-table">
            <tbody>
              <tr v-for="b in info.local" :key="b.name">
                <td class="tm-mono" style="font-size: 11.5px">{{ b.name }}</td>
                <td class="tm-muted num">{{ fmtSize(b.size) }}</td>
                <td class="num"><a class="tm-btn tm-btn-sm tm-btn-ghost" :href="`/api/settings/backups/download?name=${encodeURIComponent(b.name)}`" :title="t('settings.backups.download')"><Download :size="13" /></a></td>
              </tr>
            </tbody>
          </table>
        </div>
        <template v-if="info?.remote?.length">
          <span class="tm-label">{{ t("settings.backups.remote_list") }}</span>
          <div class="tm-table-wrap">
            <table class="tm-table">
              <tbody>
                <tr v-for="r in info.remote.slice(0, 10)" :key="r.key">
                  <td class="tm-mono" style="font-size: 11.5px">{{ r.key.replace("turbomailer/", "") }}</td>
                  <td class="tm-muted num">{{ fmtSize(r.size) }}</td>
                  <td class="tm-muted">{{ fmtDate(r.lastModified) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><RotateCcw :size="14" /> {{ t("settings.backups.restore") }}</span></h3>
        <p class="tm-hint">{{ t("settings.backups.restore_hint") }}</p>
        <label class="tm-check"><input v-model="withFiles" type="checkbox" /> {{ t("settings.backups.with_files") }}</label>
        <input ref="fileInput" type="file" accept=".zip,.enc" hidden @change="restore" />
        <div class="tm-actions" style="justify-content: flex-start">
          <button class="tm-btn" :disabled="restoring" @click="fileInput?.click()"><Loader2 v-if="restoring" :size="13" class="tm-spin" /><Upload v-else :size="13" /> {{ t("settings.backups.upload") }}</button>
        </div>
        <div v-if="restoreResult" class="restore-ok">
          <strong>{{ t("settings.backups.staged") }}</strong>
          <span>{{ t("settings.backups.staged_stats", { contacts: restoreResult.stats.contacts, campaigns: restoreResult.stats.campaigns, files: restoreResult.restoredFiles }) }}</span>
          <span>{{ t("settings.backups.restart_needed") }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.restore-ok {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.06);
}
</style>
