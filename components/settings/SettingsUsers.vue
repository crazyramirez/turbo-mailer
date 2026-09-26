<script setup lang="ts">
import { UserCog, Users, ShieldCheck, KeyRound, Plus, Pencil, Trash2, X, Copy, Download, Loader2, Wand2 } from "lucide-vue-next";

const { t } = useI18n();
const { showToast, showDialog } = useDashboardState();
const { me, can, refresh: refreshMe } = useMe();

const errMsg = (e: any) => e?.data?.statusMessage || e?.data?.message || e?.message || "Error";
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");

function randomPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}
function copy(text: string) {
  navigator.clipboard?.writeText(text);
  showToast(t("settings.copied"), "info");
}

// ── Own account ────────────────────────────────────────────────────────
const profileName = ref("");
watch(() => me.value?.user?.name, (v) => (profileName.value = v ?? ""), { immediate: true });
const pw = reactive({ current: "", next: "", confirm: "" });
const busy = ref(false);

async function saveName() {
  busy.value = true;
  try {
    await $fetch("/api/me", { method: "PUT", body: { name: profileName.value } });
    await refreshMe();
    showToast(t("settings.saved"), "success");
  } catch (e) {
    showToast(errMsg(e), "error");
  } finally {
    busy.value = false;
  }
}

async function changePassword() {
  if (pw.next !== pw.confirm) return showToast(t("settings.users.pw_mismatch"), "error");
  busy.value = true;
  try {
    const r = await $fetch<any>("/api/me", { method: "PUT", body: { currentPassword: pw.current, newPassword: pw.next } });
    storeRefreshToken(r.refreshToken);
    Object.assign(pw, { current: "", next: "", confirm: "" });
    showToast(t("settings.users.pw_changed"), "success");
  } catch (e) {
    showToast(errMsg(e), "error");
  } finally {
    busy.value = false;
  }
}

// ── 2FA ────────────────────────────────────────────────────────────────
type TfaStep = "idle" | "password" | "scan" | "codes" | "disable" | "regen";
const tfa = reactive({ step: "idle" as TfaStep, password: "", code: "", qrSvg: "", secret: "", codes: [] as string[] });

function resetTfa(step: TfaStep = "idle") {
  Object.assign(tfa, { step, password: "", code: "", qrSvg: "", secret: "" });
  if (step !== "codes") tfa.codes = [];
}

async function tfaSetup() {
  busy.value = true;
  try {
    const r = await $fetch<any>("/api/me/2fa/setup", { method: "POST", body: { password: tfa.password } });
    Object.assign(tfa, { step: "scan", qrSvg: r.qrSvg, secret: r.secret, password: "", code: "" });
  } catch (e) {
    showToast(errMsg(e), "error");
  } finally {
    busy.value = false;
  }
}

async function tfaEnable() {
  busy.value = true;
  try {
    const r = await $fetch<any>("/api/me/2fa/enable", { method: "POST", body: { code: tfa.code } });
    storeRefreshToken(r.refreshToken);
    tfa.codes = r.recoveryCodes;
    resetTfa("codes");
    await refreshMe();
    showToast(t("settings.users.tfa_enabled"), "success");
  } catch (e) {
    showToast(errMsg(e), "error");
  } finally {
    busy.value = false;
  }
}

async function tfaDisableOrRegen() {
  busy.value = true;
  try {
    if (tfa.step === "disable") {
      await $fetch("/api/me/2fa/disable", { method: "POST", body: { password: tfa.password, code: tfa.code } });
      resetTfa();
      showToast(t("settings.users.tfa_disabled"), "success");
    } else {
      const r = await $fetch<any>("/api/me/2fa/recovery", { method: "POST", body: { password: tfa.password, code: tfa.code } });
      tfa.codes = r.recoveryCodes;
      resetTfa("codes");
    }
    await refreshMe();
  } catch (e) {
    showToast(errMsg(e), "error");
  } finally {
    busy.value = false;
  }
}

function downloadCodes() {
  const blob = new Blob([`TurboMailer — ${me.value?.user?.email}\n\n${tfa.codes.join("\n")}\n`], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "turbomailer-recovery-codes.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Team (admins) ──────────────────────────────────────────────────────
const users = ref<any[]>([]);
const multiUser = computed(() => !!me.value?.multiUser);
async function loadUsers() {
  if (!can("admin")) return;
  const r = await $fetch<any>("/api/users");
  users.value = r.users;
}

const activation = reactive({ email: "", name: "", password: "", confirm: "" });
async function activate() {
  if (activation.password !== activation.confirm) return showToast(t("settings.users.pw_mismatch"), "error");
  busy.value = true;
  try {
    const r = await $fetch<any>("/api/users/activate", { method: "POST", body: activation });
    storeRefreshToken(r.refreshToken);
    await refreshMe();
    await loadUsers();
    showToast(t("settings.users.activated"), "success");
  } catch (e) {
    showToast(errMsg(e), "error");
  } finally {
    busy.value = false;
  }
}

const ROLES = ["owner", "admin", "editor", "viewer"] as const;
const assignableRoles = computed(() => (can("owner") ? ROLES : ROLES.filter((r) => r !== "owner")));

interface EditState {
  id: number | null;
  email: string;
  name: string;
  role: string;
  password: string;
  disabled: boolean;
  resetTotp: boolean;
  totpEnabled: boolean;
}
const editing = ref<EditState | null>(null);

function openCreate() {
  editing.value = { id: null, email: "", name: "", role: "editor", password: randomPassword(), disabled: false, resetTotp: false, totpEnabled: false };
}
function openEdit(u: any) {
  editing.value = { id: u.id, email: u.email, name: u.name ?? "", role: u.role, password: "", disabled: u.disabled, resetTotp: false, totpEnabled: u.totpEnabled };
}

async function saveUser() {
  const e = editing.value;
  if (!e) return;
  busy.value = true;
  try {
    if (e.id === null) {
      await $fetch("/api/users", { method: "POST", body: { email: e.email, name: e.name, role: e.role, password: e.password } });
      await showDialog({ type: "confirm", title: t("settings.users.created"), message: t("settings.users.share_credentials", { email: e.email, password: e.password }) });
    } else {
      const body: Record<string, unknown> = { name: e.name, role: e.role, disabled: e.disabled };
      if (e.password) body.password = e.password;
      if (e.resetTotp) body.resetTotp = true;
      const r = await $fetch<any>(`/api/users/${e.id}`, { method: "PUT", body });
      storeRefreshToken(r.refreshToken);
      showToast(t("settings.saved"), "success");
    }
    editing.value = null;
    await loadUsers();
  } catch (err) {
    showToast(errMsg(err), "error");
  } finally {
    busy.value = false;
  }
}

async function removeUser(u: any) {
  if (!(await showDialog({ type: "confirm", title: t("settings.users.delete_title"), message: u.email }))) return;
  try {
    await $fetch(`/api/users/${u.id}`, { method: "DELETE" });
    await loadUsers();
  } catch (e) {
    showToast(errMsg(e), "error");
  }
}

onMounted(async () => {
  if (!me.value) await refreshMe();
  await loadUsers();
});
</script>

<template>
  <div class="tm-main" style="padding: 0">
    <div class="tm-grid-2">
      <!-- My account -->
      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><UserCog :size="14" /> {{ t("settings.users.my_account") }}</span>
          <span class="tm-badge accent">{{ t(`settings.users.role_${me?.role ?? "owner"}`) }}</span>
        </h3>
        <template v-if="me?.user">
          <div class="tm-field"><label>Email</label><input :value="me.user.email" class="tm-input" disabled /></div>
          <div class="tm-row" style="align-items: flex-end">
            <div class="tm-field"><label>{{ t("settings.sending.name") }}</label><input v-model="profileName" class="tm-input" /></div>
            <button class="tm-btn" :disabled="busy" @click="saveName">{{ t("settings.save") }}</button>
          </div>
        </template>
        <p v-else class="tm-hint">{{ t("settings.users.legacy_hint") }}</p>

        <span class="tm-label">{{ me?.user ? t("settings.users.change_password") : t("settings.users.change_access_password") }}</span>
        <div class="tm-field"><label>{{ t("settings.users.current_password") }}</label><input v-model="pw.current" type="password" class="tm-input" autocomplete="current-password" /></div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.users.new_password") }}</label><input v-model="pw.next" type="password" class="tm-input" autocomplete="new-password" minlength="10" /></div>
          <div class="tm-field"><label>{{ t("settings.users.confirm_password") }}</label><input v-model="pw.confirm" type="password" class="tm-input" autocomplete="new-password" /></div>
        </div>
        <p class="tm-hint">{{ t("settings.users.pw_rules") }}</p>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="busy || !pw.current || pw.next.length < 10" @click="changePassword">{{ t("settings.users.update_password") }}</button></div>
      </section>

      <!-- Two-factor -->
      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><ShieldCheck :size="14" /> {{ t("settings.users.tfa") }}</span>
          <span v-if="me?.user" class="tm-badge" :class="me.user.totpEnabled ? 'ok' : 'warn'">{{ me.user.totpEnabled ? t("settings.users.tfa_on") : t("settings.users.tfa_off") }}</span>
        </h3>
        <p v-if="!me?.user" class="tm-hint">{{ t("settings.users.tfa_needs_team") }}</p>

        <template v-else-if="tfa.step === 'codes'">
          <p class="tm-hint"><strong>{{ t("settings.users.codes_once") }}</strong></p>
          <div class="codes"><code v-for="c in tfa.codes" :key="c">{{ c }}</code></div>
          <div class="tm-actions">
            <button class="tm-btn tm-btn-sm" @click="copy(tfa.codes.join('\n'))"><Copy :size="12" /> {{ t("settings.copy") }}</button>
            <button class="tm-btn tm-btn-sm" @click="downloadCodes"><Download :size="12" /> {{ t("settings.users.download") }}</button>
            <button class="tm-btn tm-btn-sm tm-btn-primary" @click="resetTfa()">{{ t("settings.integ.done") }}</button>
          </div>
        </template>

        <template v-else-if="!me.user.totpEnabled">
          <p class="tm-hint">{{ t("settings.users.tfa_hint") }}</p>
          <div v-if="tfa.step === 'idle'" class="tm-actions" style="justify-content: flex-start">
            <button class="tm-btn tm-btn-primary" @click="resetTfa('password')"><KeyRound :size="13" /> {{ t("settings.users.tfa_enable") }}</button>
          </div>
          <template v-else-if="tfa.step === 'password'">
            <div class="tm-field"><label>{{ t("settings.users.confirm_with_password") }}</label><input v-model="tfa.password" type="password" class="tm-input" autocomplete="current-password" @keydown.enter="tfaSetup" /></div>
            <div class="tm-actions">
              <button class="tm-btn" @click="resetTfa()">{{ t("common.cancel") }}</button>
              <button class="tm-btn tm-btn-primary" :disabled="busy || !tfa.password" @click="tfaSetup"><Loader2 v-if="busy" :size="13" class="tm-spin" /> {{ t("settings.users.continue") }}</button>
            </div>
          </template>
          <template v-else-if="tfa.step === 'scan'">
            <ol class="tfa-steps">
              <li>{{ t("settings.users.scan_step") }}</li>
              <li>{{ t("settings.users.code_step") }}</li>
            </ol>
            <!-- SVG generated by our own server from the otpauth URI -->
            <div class="qr" v-html="tfa.qrSvg"></div>
            <p class="tm-hint">{{ t("settings.users.manual_key") }} <code class="tm-mono">{{ tfa.secret }}</code> <button class="tm-btn tm-btn-sm tm-btn-ghost" @click="copy(tfa.secret)"><Copy :size="11" /></button></p>
            <div class="tm-field"><label>{{ t("settings.users.code") }}</label>
              <input v-model="tfa.code" class="tm-input code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" @keydown.enter="tfaEnable" />
            </div>
            <div class="tm-actions">
              <button class="tm-btn" @click="resetTfa()">{{ t("common.cancel") }}</button>
              <button class="tm-btn tm-btn-primary" :disabled="busy || tfa.code.length !== 6" @click="tfaEnable">{{ t("settings.users.verify_enable") }}</button>
            </div>
          </template>
        </template>

        <template v-else>
          <p class="tm-hint">{{ t("settings.users.tfa_active_hint", { n: me.user.recoveryCodesLeft }) }}</p>
          <template v-if="tfa.step === 'disable' || tfa.step === 'regen'">
            <div class="tm-row">
              <div class="tm-field"><label>{{ t("settings.users.current_password") }}</label><input v-model="tfa.password" type="password" class="tm-input" autocomplete="current-password" /></div>
              <div class="tm-field"><label>{{ t("settings.users.code_or_recovery") }}</label><input v-model="tfa.code" class="tm-input" autocomplete="one-time-code" /></div>
            </div>
            <div class="tm-actions">
              <button class="tm-btn" @click="resetTfa()">{{ t("common.cancel") }}</button>
              <button class="tm-btn" :class="tfa.step === 'disable' ? 'tm-btn-danger' : 'tm-btn-primary'" :disabled="busy || !tfa.password || !tfa.code" @click="tfaDisableOrRegen">
                {{ tfa.step === "disable" ? t("settings.users.tfa_disable") : t("settings.users.regen_codes") }}
              </button>
            </div>
          </template>
          <div v-else class="tm-actions" style="justify-content: flex-start">
            <button class="tm-btn" @click="resetTfa('regen')">{{ t("settings.users.regen_codes") }}</button>
            <button class="tm-btn tm-btn-danger" @click="resetTfa('disable')">{{ t("settings.users.tfa_disable") }}</button>
          </div>
        </template>
      </section>
    </div>

    <!-- Team -->
    <section v-if="can('admin')" class="tm-card">
      <h3 class="tm-card-title">
        <span class="tm-title-left"><Users :size="14" /> {{ t("settings.users.team") }}</span>
        <button v-if="multiUser" class="tm-btn tm-btn-sm" @click="openCreate"><Plus :size="12" /> {{ t("settings.users.add") }}</button>
      </h3>

      <template v-if="!multiUser">
        <p class="tm-hint">{{ t("settings.users.activate_hint") }}</p>
        <div class="tm-row">
          <div class="tm-field"><label>Email</label><input v-model="activation.email" type="email" class="tm-input" autocomplete="username" /></div>
          <div class="tm-field"><label>{{ t("settings.sending.name") }}</label><input v-model="activation.name" class="tm-input" /></div>
        </div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.users.new_password") }}</label><input v-model="activation.password" type="password" class="tm-input" autocomplete="new-password" /></div>
          <div class="tm-field"><label>{{ t("settings.users.confirm_password") }}</label><input v-model="activation.confirm" type="password" class="tm-input" autocomplete="new-password" /></div>
        </div>
        <div class="tm-actions">
          <button class="tm-btn tm-btn-primary" :disabled="busy || !activation.email || activation.password.length < 10" @click="activate">{{ t("settings.users.activate") }}</button>
        </div>
      </template>

      <div v-else class="tm-table-wrap">
        <table class="tm-table">
          <thead><tr><th>{{ t("settings.users.user") }}</th><th>{{ t("settings.users.role") }}</th><th>2FA</th><th>{{ t("settings.users.last_login") }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" :style="u.disabled ? 'opacity:.5' : ''">
              <td><strong>{{ u.name || u.email }}</strong><div v-if="u.name" class="tm-muted" style="font-size: 11.5px">{{ u.email }}</div></td>
              <td><span class="tm-badge" :class="u.role === 'owner' ? 'accent' : u.role === 'admin' ? 'info' : ''">{{ t(`settings.users.role_${u.role}`) }}</span>
                <span v-if="u.disabled" class="tm-badge bad" style="margin-left: 4px">{{ t("settings.users.disabled") }}</span></td>
              <td><span class="tm-dot" :class="u.totpEnabled ? 'ok' : 'warn'" /></td>
              <td class="tm-muted">{{ fmtDate(u.lastLoginAt) }}</td>
              <td class="num">
                <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.edit')" @click="openEdit(u)"><Pencil :size="13" /></button>
                <button v-if="u.id !== me?.user?.id" class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.delete')" @click="removeUser(u)"><Trash2 :size="13" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul class="roles-help">
        <li v-for="r in ROLES" :key="r"><strong>{{ t(`settings.users.role_${r}`) }}</strong> — {{ t(`settings.users.role_${r}_desc`) }}</li>
      </ul>
    </section>

    <Teleport to="body">
      <div v-if="editing" class="tm-modal-backdrop" @click.self="editing = null">
        <div class="tm-modal" role="dialog" aria-modal="true">
          <div class="tm-modal-head">
            <h2>{{ editing.id === null ? t("settings.users.add") : editing.email }}</h2>
            <button class="tm-btn tm-btn-ghost tm-icon-btn" @click="editing = null"><X :size="16" /></button>
          </div>
          <div class="tm-modal-body">
            <div v-if="editing.id === null" class="tm-field"><label>Email</label><input v-model="editing.email" type="email" class="tm-input" /></div>
            <div class="tm-field"><label>{{ t("settings.sending.name") }}</label><input v-model="editing.name" class="tm-input" /></div>
            <div class="tm-field"><label>{{ t("settings.users.role") }}</label>
              <select v-model="editing.role" class="tm-select" :disabled="editing.id === me?.user?.id">
                <option v-for="r in assignableRoles" :key="r" :value="r">{{ t(`settings.users.role_${r}`) }}</option>
              </select>
            </div>
            <div class="tm-field">
              <label>{{ editing.id === null ? t("settings.users.initial_password") : t("settings.users.reset_password") }}</label>
              <div class="tm-row" style="flex-wrap: nowrap">
                <div class="tm-field"><input v-model="editing.password" class="tm-input tm-mono" autocomplete="off" :placeholder="editing.id === null ? '' : t('settings.users.leave_blank')" /></div>
                <button class="tm-btn tm-btn-sm" :title="t('settings.users.generate')" @click="editing.password = randomPassword()"><Wand2 :size="12" /></button>
              </div>
            </div>
            <template v-if="editing.id !== null && editing.id !== me?.user?.id">
              <label class="tm-check"><input v-model="editing.disabled" type="checkbox" /> {{ t("settings.users.disable_account") }}</label>
              <label v-if="editing.totpEnabled" class="tm-check"><input v-model="editing.resetTotp" type="checkbox" /> {{ t("settings.users.reset_tfa") }}</label>
            </template>
          </div>
          <div class="tm-modal-foot">
            <button class="tm-btn" @click="editing = null">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="busy || (editing.id === null && (!editing.email || editing.password.length < 10))" @click="saveUser">{{ t("settings.save") }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.codes code {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  text-align: center;
}
.qr {
  width: 180px;
  height: 180px;
  background: #fff;
  border-radius: 12px;
  padding: 8px;
  align-self: center;
}
.qr :deep(svg) {
  width: 100%;
  height: 100%;
}
.tfa-steps {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--text-muted);
  display: grid;
  gap: 4px;
}
.code-input {
  font-family: ui-monospace, monospace;
  font-size: 18px;
  letter-spacing: 0.3em;
  text-align: center;
  max-width: 200px;
}
.roles-help {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-muted);
  display: grid;
  gap: 3px;
}
</style>
