<script setup lang="ts">
import {
  Lock, Eye, EyeOff, Server, Globe, Shield, CheckCircle2,
  ChevronRight, ChevronLeft, Zap, RefreshCw, AlertTriangle,
  Settings2, RotateCcw, Brain, Key,
} from "lucide-vue-next";
import { APP_VERSION } from "@/utils/version";

definePageMeta({ layout: false });

const { t } = useI18n();

// ── Steps ──────────────────────────────────────────────────────────────
// 0=welcome 1=security 2=smtp 3=app 4=openai 5=dkim 6=review  then isDone=true
const step = ref(0);
const STEPS = 6;
const installing = ref(false);
const installError = ref("");
const isDone = ref(false);

// ── Step 1 — Security ─────────────────────────────────────────────────
const password = ref("");
const confirmPassword = ref("");
const showPass = ref(false);
const showConfirmPass = ref(false);
const errPass = ref("");
const errConfirm = ref("");

function validateSecurity(): boolean {
  errPass.value = "";
  errConfirm.value = "";
  if (password.value.length < 8) {
    errPass.value = t("setup.security_too_short");
    return false;
  }
  if (password.value !== confirmPassword.value) {
    errConfirm.value = t("setup.security_mismatch");
    return false;
  }
  return true;
}

// ── Step 2 — SMTP ─────────────────────────────────────────────────────
const smtpHost = ref("");
const smtpPort = ref("465");
const smtpUser = ref("");
const smtpPass = ref("");
const smtpSecure = ref(true);
const smtpFromName = ref("");
const smtpFromEmail = ref("");
const smtpSendDelayMs = ref(2000);
const smtpSendJitterMs = ref(500);
const smtpMaxRetries = ref(3);
const smtpRetryDelayMs = ref(5000);
const showSmtpPass = ref(false);
const showAdvanced = ref(false);
const smtpTesting = ref(false);
const smtpResult = ref<"idle" | "ok" | "error">("idle");
const smtpErrMsg = ref("");

function validateSmtp(): boolean {
  return Boolean(smtpHost.value && smtpUser.value && smtpPass.value);
}

async function testSmtp() {
  if (!validateSmtp()) return;
  smtpTesting.value = true;
  smtpResult.value = "idle";
  smtpErrMsg.value = "";
  try {
    await $fetch("/api/setup/test-smtp", {
      method: "POST",
      body: {
        host: smtpHost.value,
        port: smtpPort.value,
        user: smtpUser.value,
        pass: smtpPass.value,
        secure: smtpSecure.value,
      },
    });
    smtpResult.value = "ok";
  } catch (e: any) {
    smtpResult.value = "error";
    smtpErrMsg.value = e?.data?.message || e?.message || "Error";
  } finally {
    smtpTesting.value = false;
  }
}

// ── Step 3 — App ──────────────────────────────────────────────────────
const trackingBaseUrl = ref("");
const autoSecrets = ref(true);
const unsubscribeSecret = ref("");
const apiSecret = ref("");

function validateApp(): boolean {
  return trackingBaseUrl.value.startsWith("http");
}

// ── Step 4 — Advanced (optional) ─────────────────────────────────────
const openaiApiKey = ref("");
const openaiModel = ref("gpt-4o-mini");
const showOpenaiKey = ref(false);
const dkimDomain = ref("");
const dkimSelector = ref("default");
const dkimPrivateKey = ref("");

// ── Navigation ────────────────────────────────────────────────────────
function canProceed(): boolean {
  if (step.value === 1) return validateSecurity();
  if (step.value === 2) return validateSmtp();
  if (step.value === 3) return validateApp();
  return true; // step 4 (advanced) always valid — all optional
}

function next() {
  if (!canProceed()) return;
  if (step.value === STEPS) {
    install();
    return;
  }
  step.value++;
}

function prev() {
  if (step.value > 0) step.value--;
}

// ── Install ───────────────────────────────────────────────────────────
async function install() {
  installing.value = true;
  installError.value = "";
  try {
    await $fetch("/api/setup/complete", {
      method: "POST",
      body: {
        password: password.value,
        smtp: {
          host: smtpHost.value,
          port: smtpPort.value,
          user: smtpUser.value,
          pass: smtpPass.value,
          secure: smtpSecure.value,
          fromName: smtpFromName.value || smtpUser.value,
          fromEmail: smtpFromEmail.value || smtpUser.value,
          sendDelayMs: smtpSendDelayMs.value,
          sendJitterMs: smtpSendJitterMs.value,
          maxRetries: smtpMaxRetries.value,
          retryDelayMs: smtpRetryDelayMs.value,
        },
        app: {
          trackingBaseUrl: trackingBaseUrl.value,
          unsubscribeSecret: autoSecrets.value ? "" : unsubscribeSecret.value,
          apiSecret: autoSecrets.value ? "" : apiSecret.value,
        },
        advanced: {
          openaiApiKey: openaiApiKey.value,
          openaiModel: openaiModel.value,
          dkimDomain: dkimDomain.value,
          dkimSelector: dkimSelector.value,
          dkimPrivateKey: dkimPrivateKey.value,
        },
      },
    });
    isDone.value = true;
  } catch (e: any) {
    installError.value = e?.data?.message || t("setup.install_error");
  } finally {
    installing.value = false;
  }
}

// ── Restart detection ─────────────────────────────────────────────────
let originalStartedAt = 0;
const pollStatus = ref<"idle" | "checking" | "ready" | "not_restarted" | "down">("idle");
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function checkRestart() {
  if (pollStatus.value === "checking") return;
  pollStatus.value = "checking";
  if (pollTimer) clearInterval(pollTimer);

  let tries = 0;
  const MAX_TRIES = 12;

  pollTimer = setInterval(async () => {
    tries++;
    try {
      const { startedAt } = await $fetch<{ ok: boolean; startedAt: number }>("/api/health");
      if (startedAt > originalStartedAt) {
        clearInterval(pollTimer!);
        pollStatus.value = "ready";
        setTimeout(() => navigateTo("/login"), 2000);
      } else if (tries >= MAX_TRIES) {
        clearInterval(pollTimer!);
        pollStatus.value = "not_restarted";
      }
    } catch {
      if (tries >= MAX_TRIES) {
        clearInterval(pollTimer!);
        pollStatus.value = "down";
      }
    }
  }, 3000);
}

onMounted(async () => {
  if (process.client) {
    trackingBaseUrl.value = window.location.origin;
  }
  try {
    const { startedAt } = await $fetch<{ ok: boolean; startedAt: number }>("/api/health");
    originalStartedAt = startedAt;
  } catch {}
  try {
    const { installed } = await $fetch<{ installed: boolean }>("/api/setup/status");
    if (installed) await navigateTo("/dashboard");
  } catch {}
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="sw-wrapper">
    <!-- Ambient background -->
    <div class="sw-bg" aria-hidden="true">
      <div class="bg-grid"></div>
      <div class="bg-orb bg-orb-1"></div>
      <div class="bg-orb bg-orb-2"></div>
      <div class="bg-orb bg-orb-3"></div>
    </div>

    <!-- Done screen -->
    <Transition name="sw-fade" mode="out-in">
      <div v-if="isDone" class="sw-card sw-done">
        <div class="done-icon">
          <CheckCircle2 :size="32" />
        </div>
        <h2 class="done-title">{{ t("setup.done_title") }}</h2>
        <p class="done-sub">{{ t("setup.done_subtitle") }}</p>

        <div class="done-files">
          <CheckCircle2 :size="13" />
          <span>data/config.json</span>
          <CheckCircle2 :size="13" />
          <span>.env</span>
          <CheckCircle2 :size="13" />
          <span>data/.installed</span>
        </div>

        <div class="done-restart-box">
          <div class="done-restart-header">
            <RotateCcw :size="16" />
            <span>{{ t("setup.done_restart_title") }}</span>
          </div>
          <p class="done-restart-desc">{{ t("setup.done_restart_desc") }}</p>
          <ol class="done-steps">
            <li>{{ t("setup.done_restart_step1") }}</li>
            <li>{{ t("setup.done_restart_step2") }}</li>
            <li>{{ t("setup.done_restart_step3") }}</li>
          </ol>
        </div>

        <Transition name="sw-fade" mode="out-in">
          <div v-if="pollStatus === 'ready'" class="poll-ready">
            <CheckCircle2 :size="16" />
            {{ t("setup.done_ready") }}
          </div>
          <div v-else-if="pollStatus === 'checking'" class="poll-checking">
            <span class="sw-spinner"></span>
            {{ t("setup.done_checking") }}
          </div>
          <div v-else-if="pollStatus === 'not_restarted'" class="poll-warn">
            <AlertTriangle :size="14" />
            {{ t("setup.done_not_restarted") }}
          </div>
          <div v-else-if="pollStatus === 'down'" class="poll-warn">
            <AlertTriangle :size="14" />
            {{ t("setup.done_still_down") }}
          </div>
          <button v-else class="sw-btn-primary" @click="checkRestart">
            <RefreshCw :size="15" />
            {{ t("setup.done_check_btn") }}
          </button>
        </Transition>

        <p class="sw-footer">TurboMailer {{ APP_VERSION }}</p>
      </div>

      <!-- Wizard card -->
      <div v-else class="sw-card">
        <!-- Logo header -->
        <div class="sw-logo">
          <div class="sw-logo-icon">
            <img src="/images/icons/web-app-manifest-192x192.png" alt="Logo" />
          </div>
          <div class="sw-logo-text">
            <span class="sw-logo-title">TurboMailer <span class="sw-accent">PRO</span></span>
            <span class="sw-logo-sub">{{ t("setup.page_title") }}</span>
          </div>
        </div>

        <div class="sw-divider"></div>

        <!-- Step indicator (steps 1-4) -->
        <div v-if="step > 0" class="sw-steps">
          <div
            v-for="i in STEPS"
            :key="i"
            class="sw-step-dot"
            :class="{ active: i === step, done: i < step }"
          >
            <CheckCircle2 v-if="i < step" :size="14" />
            <span v-else>{{ i }}</span>
          </div>
          <span class="sw-step-label">
            {{ t("setup.step_of", { n: step, total: STEPS }) }}
          </span>
        </div>

        <!-- ── Step 0: Welcome ── -->
        <Transition name="sw-slide" mode="out-in">
          <div v-if="step === 0" key="s0" class="sw-step">
            <h2 class="sw-title">{{ t("setup.welcome_title") }}</h2>
            <p class="sw-sub">{{ t("setup.welcome_subtitle") }}</p>

            <div class="sw-feature-list">
              <div class="sw-feature">
                <Shield :size="16" />
                <span>{{ t("setup.step_security") }}</span>
              </div>
              <div class="sw-feature">
                <Server :size="16" />
                <span>{{ t("setup.step_smtp") }}</span>
              </div>
              <div class="sw-feature">
                <Globe :size="16" />
                <span>{{ t("setup.step_app") }}</span>
              </div>
              <div class="sw-feature">
                <Brain :size="16" />
                <span>{{ t("setup.step_openai") }}</span>
              </div>
              <div class="sw-feature">
                <Key :size="16" />
                <span>{{ t("setup.step_dkim") }}</span>
              </div>
              <div class="sw-feature">
                <Settings2 :size="16" />
                <span>{{ t("setup.step_review") }}</span>
              </div>
            </div>

            <button class="sw-btn-primary" @click="next">
              <Zap :size="16" />
              {{ t("setup.welcome_start") }}
            </button>
          </div>

          <!-- ── Step 1: Security ── -->
          <div v-else-if="step === 1" key="s1" class="sw-step">
            <h2 class="sw-title">{{ t("setup.security_title") }}</h2>
            <p class="sw-sub">{{ t("setup.security_subtitle") }}</p>

            <div class="sw-fields">
              <div class="sw-field" :class="{ error: errPass }">
                <label>{{ t("setup.security_password") }}</label>
                <div class="sw-input-wrap">
                  <Lock :size="15" class="sw-field-icon" />
                  <input
                    v-model="password"
                    :type="showPass ? 'text' : 'password'"
                    :placeholder="t('setup.security_placeholder')"
                    autocomplete="new-password"
                    @keydown.enter="next"
                  />
                  <button type="button" class="sw-eye" @click="showPass = !showPass">
                    <Eye v-if="!showPass" :size="15" />
                    <EyeOff v-else :size="15" />
                  </button>
                </div>
                <p v-if="errPass" class="sw-field-err">{{ errPass }}</p>
              </div>

              <div class="sw-field" :class="{ error: errConfirm }">
                <label>{{ t("setup.security_confirm") }}</label>
                <div class="sw-input-wrap">
                  <Lock :size="15" class="sw-field-icon" />
                  <input
                    v-model="confirmPassword"
                    :type="showConfirmPass ? 'text' : 'password'"
                    :placeholder="t('setup.security_confirm_placeholder')"
                    autocomplete="new-password"
                    @keydown.enter="next"
                  />
                  <button type="button" class="sw-eye" @click="showConfirmPass = !showConfirmPass">
                    <Eye v-if="!showConfirmPass" :size="15" />
                    <EyeOff v-else :size="15" />
                  </button>
                </div>
                <p v-if="errConfirm" class="sw-field-err">{{ errConfirm }}</p>
              </div>
            </div>
          </div>

          <!-- ── Step 2: SMTP ── -->
          <div v-else-if="step === 2" key="s2" class="sw-step">
            <h2 class="sw-title">{{ t("setup.smtp_title") }}</h2>
            <p class="sw-sub">{{ t("setup.smtp_subtitle") }}</p>

            <div class="sw-fields">
              <div class="sw-field-row">
                <div class="sw-field" style="flex:1">
                  <label>{{ t("setup.smtp_host") }}</label>
                  <div class="sw-input-wrap">
                    <Server :size="15" class="sw-field-icon" />
                    <input v-model="smtpHost" :placeholder="t('setup.smtp_host_ph')" autocomplete="off" />
                  </div>
                </div>
                <div class="sw-field" style="width:90px">
                  <label>{{ t("setup.smtp_port") }}</label>
                  <div class="sw-input-wrap">
                    <input v-model="smtpPort" placeholder="465" />
                  </div>
                </div>
              </div>

              <div class="sw-field">
                <label>{{ t("setup.smtp_user") }}</label>
                <div class="sw-input-wrap">
                  <input v-model="smtpUser" type="email" :placeholder="t('setup.smtp_user_ph')" autocomplete="off" />
                </div>
              </div>

              <div class="sw-field">
                <label>{{ t("setup.smtp_pass") }}</label>
                <div class="sw-input-wrap">
                  <Lock :size="15" class="sw-field-icon" />
                  <input
                    v-model="smtpPass"
                    :type="showSmtpPass ? 'text' : 'password'"
                    placeholder="••••••••"
                    autocomplete="off"
                  />
                  <button type="button" class="sw-eye" @click="showSmtpPass = !showSmtpPass">
                    <Eye v-if="!showSmtpPass" :size="15" />
                    <EyeOff v-else :size="15" />
                  </button>
                </div>
              </div>

              <label class="sw-toggle">
                <input v-model="smtpSecure" type="checkbox" />
                <span class="sw-toggle-track"></span>
                <span>{{ t("setup.smtp_secure") }}</span>
              </label>

              <div class="sw-field-row">
                <div class="sw-field" style="flex:1">
                  <label>{{ t("setup.smtp_from_name") }}</label>
                  <div class="sw-input-wrap">
                    <input v-model="smtpFromName" :placeholder="t('setup.smtp_from_name_ph')" />
                  </div>
                </div>
                <div class="sw-field" style="flex:1">
                  <label>{{ t("setup.smtp_from_email") }}</label>
                  <div class="sw-input-wrap">
                    <input v-model="smtpFromEmail" type="email" :placeholder="t('setup.smtp_from_email_ph')" />
                  </div>
                </div>
              </div>

              <!-- SMTP test -->
              <div class="sw-smtp-test">
                <button
                  class="sw-btn-outline"
                  :disabled="!validateSmtp() || smtpTesting"
                  @click="testSmtp"
                >
                  <span v-if="smtpTesting" class="sw-spinner"></span>
                  <Server v-else :size="14" />
                  {{ smtpTesting ? t("setup.smtp_testing") : t("setup.smtp_test") }}
                </button>
                <Transition name="sw-fade">
                  <div v-if="smtpResult === 'ok'" class="smtp-result ok">
                    <CheckCircle2 :size="13" />
                    {{ t("setup.smtp_ok") }}
                  </div>
                  <div v-else-if="smtpResult === 'error'" class="smtp-result err">
                    <AlertTriangle :size="13" />
                    {{ smtpErrMsg || t("setup.smtp_error") }}
                  </div>
                </Transition>
              </div>

              <!-- Advanced -->
              <button class="sw-advanced-toggle" @click="showAdvanced = !showAdvanced">
                <ChevronRight :size="14" :class="{ rotated: showAdvanced }" />
                {{ t("setup.smtp_advanced") }}
              </button>

              <Transition name="sw-slide">
                <div v-if="showAdvanced" class="sw-advanced">
                  <div class="sw-field-row">
                    <div class="sw-field" style="flex:1">
                      <label>{{ t("setup.smtp_delay_ms") }}</label>
                      <div class="sw-input-wrap">
                        <input v-model.number="smtpSendDelayMs" type="number" min="0" />
                      </div>
                    </div>
                    <div class="sw-field" style="flex:1">
                      <label>{{ t("setup.smtp_jitter_ms") }}</label>
                      <div class="sw-input-wrap">
                        <input v-model.number="smtpSendJitterMs" type="number" min="0" />
                      </div>
                    </div>
                  </div>
                  <div class="sw-field-row">
                    <div class="sw-field" style="flex:1">
                      <label>{{ t("setup.smtp_max_retries") }}</label>
                      <div class="sw-input-wrap">
                        <input v-model.number="smtpMaxRetries" type="number" min="0" max="10" />
                      </div>
                    </div>
                    <div class="sw-field" style="flex:1">
                      <label>{{ t("setup.smtp_retry_delay_ms") }}</label>
                      <div class="sw-input-wrap">
                        <input v-model.number="smtpRetryDelayMs" type="number" min="0" />
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- ── Step 3: App ── -->
          <div v-else-if="step === 3" key="s3" class="sw-step">
            <h2 class="sw-title">{{ t("setup.app_title") }}</h2>
            <p class="sw-sub">{{ t("setup.app_subtitle") }}</p>

            <div class="sw-fields">
              <div class="sw-field">
                <label>{{ t("setup.app_tracking_url") }}</label>
                <div class="sw-input-wrap">
                  <Globe :size="15" class="sw-field-icon" />
                  <input v-model="trackingBaseUrl" placeholder="https://mail.miempresa.com" />
                </div>
                <p class="sw-field-hint">{{ t("setup.app_tracking_hint") }}</p>
              </div>

              <div class="sw-section-sep">{{ t("setup.app_secrets_title") }}</div>

              <label class="sw-toggle">
                <input v-model="autoSecrets" type="checkbox" />
                <span class="sw-toggle-track"></span>
                <span>{{ t("setup.app_auto_secrets") }}</span>
              </label>

              <p class="sw-field-hint" style="margin-top:-4px">{{ t("setup.app_secrets_hint") }}</p>

              <Transition name="sw-slide">
                <div v-if="!autoSecrets" class="sw-fields">
                  <div class="sw-field">
                    <label>{{ t("setup.app_unsub_secret") }}</label>
                    <div class="sw-input-wrap">
                      <input v-model="unsubscribeSecret" placeholder="hex string (64 chars)" />
                    </div>
                  </div>
                  <div class="sw-field">
                    <label>{{ t("setup.app_api_secret") }}</label>
                    <div class="sw-input-wrap">
                      <input v-model="apiSecret" placeholder="hex string" />
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- ── Step 4: OpenAI (optional) ── -->
          <div v-else-if="step === 4" key="s4" class="sw-step">
            <h2 class="sw-title">{{ t("setup.openai_title") }}</h2>
            <p class="sw-sub">{{ t("setup.openai_hint") }}</p>

            <div class="sw-fields">
              <div class="sw-field">
                <label>{{ t("setup.openai_api_key") }}</label>
                <div class="sw-input-wrap">
                  <input
                    v-model="openaiApiKey"
                    :type="showOpenaiKey ? 'text' : 'password'"
                    :placeholder="t('setup.openai_api_key_ph')"
                    autocomplete="off"
                  />
                  <button type="button" class="sw-eye" @click="showOpenaiKey = !showOpenaiKey">
                    <Eye v-if="!showOpenaiKey" :size="15" />
                    <EyeOff v-else :size="15" />
                  </button>
                </div>
              </div>

              <div class="sw-field">
                <label>{{ t("setup.openai_model") }}</label>
                <div class="sw-input-wrap">
                  <select v-model="openaiModel" class="sw-select">
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="gpt-4-turbo">gpt-4-turbo</option>
                    <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Step 5: DKIM (optional) ── -->
          <div v-else-if="step === 5" key="s5" class="sw-step">
            <h2 class="sw-title">{{ t("setup.dkim_title") }}</h2>
            <p class="sw-sub">{{ t("setup.dkim_hint") }}</p>

            <div class="sw-fields">
              <div class="sw-field-row">
                <div class="sw-field" style="flex:1">
                  <label>{{ t("setup.dkim_domain") }}</label>
                  <div class="sw-input-wrap">
                    <input v-model="dkimDomain" :placeholder="t('setup.dkim_domain_ph')" />
                  </div>
                </div>
                <div class="sw-field" style="width:130px">
                  <label>{{ t("setup.dkim_selector") }}</label>
                  <div class="sw-input-wrap">
                    <input v-model="dkimSelector" :placeholder="t('setup.dkim_selector_ph')" />
                  </div>
                </div>
              </div>

              <div class="sw-field">
                <label>{{ t("setup.dkim_private_key") }}</label>
                <textarea
                  v-model="dkimPrivateKey"
                  class="sw-textarea"
                  rows="6"
                  :placeholder="t('setup.dkim_private_key_ph')"
                  spellcheck="false"
                ></textarea>
              </div>
            </div>
          </div>

          <!-- ── Step 6: Review ── -->
          <div v-else-if="step === 6" key="s6" class="sw-step">
            <h2 class="sw-title">{{ t("setup.review_title") }}</h2>
            <p class="sw-sub">{{ t("setup.review_subtitle") }}</p>

            <div class="sw-review">
              <div class="sw-review-row">
                <Shield :size="14" />
                <span class="sw-review-key">{{ t("setup.review_admin") }}</span>
                <span class="sw-review-val ok">{{ t("setup.review_password_ok") }}</span>
              </div>
              <div class="sw-review-row">
                <Server :size="14" />
                <span class="sw-review-key">{{ t("setup.review_smtp") }}</span>
                <span class="sw-review-val">{{ smtpHost }}:{{ smtpPort }} ({{ smtpUser }})</span>
              </div>
              <div class="sw-review-row">
                <Globe :size="14" />
                <span class="sw-review-key">{{ t("setup.review_url") }}</span>
                <span class="sw-review-val">{{ trackingBaseUrl }}</span>
              </div>
              <div class="sw-review-row">
                <Lock :size="14" />
                <span class="sw-review-key">{{ t("setup.review_secrets") }}</span>
                <span class="sw-review-val ok">
                  {{ autoSecrets ? t("setup.review_secrets_auto") : t("setup.review_secrets_custom") }}
                </span>
              </div>
              <div class="sw-review-row">
                <Brain :size="14" />
                <span class="sw-review-key">{{ t("setup.review_openai") }}</span>
                <span class="sw-review-val" :class="{ ok: openaiApiKey }">
                  {{ openaiApiKey ? t("setup.review_openai_set") : t("setup.review_openai_skip") }}
                </span>
              </div>
              <div class="sw-review-row">
                <Key :size="14" />
                <span class="sw-review-key">{{ t("setup.review_dkim") }}</span>
                <span class="sw-review-val" :class="{ ok: dkimDomain && dkimPrivateKey }">
                  {{ (dkimDomain && dkimPrivateKey) ? t("setup.review_dkim_set") : t("setup.review_dkim_skip") }}
                </span>
              </div>
            </div>

            <Transition name="sw-fade">
              <div v-if="installError" class="sw-install-err">
                <AlertTriangle :size="14" />
                {{ installError }}
              </div>
            </Transition>
          </div>
        </Transition>

        <!-- Navigation buttons -->
        <div class="sw-nav" :class="{ centered: step === 0 }">
          <button v-if="step > 0" class="sw-btn-back" @click="prev">
            <ChevronLeft :size="15" />
            {{ t("setup.prev") }}
          </button>
          <button
            v-if="step > 0 && step < STEPS"
            class="sw-btn-primary"
            :disabled="step === 2 && !validateSmtp()"
            @click="next"
          >
            {{ t("setup.next") }}
            <ChevronRight :size="15" />
          </button>
          <button
            v-else-if="step === STEPS"
            class="sw-btn-install"
            :disabled="installing"
            @click="install"
          >
            <span v-if="installing" class="sw-spinner"></span>
            <Zap v-else :size="15" />
            {{ installing ? t("setup.review_installing") : t("setup.review_install") }}
          </button>
        </div>

        <p class="sw-footer">TurboMailer {{ APP_VERSION }}</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.sw-wrapper {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #03040a;
  font-family: "Plus Jakarta Sans", sans-serif;
}

.sw-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.sw-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 520px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 28px;
  padding: 36px 38px 32px;
  backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    0 0 0 1px rgba(99, 102, 241, 0.08),
    0 32px 80px -16px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* ── Logo ── */
.sw-logo {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.sw-logo-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25);
}

.sw-logo-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sw-logo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sw-logo-title {
  font-size: 18px;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.02em;
}

.sw-accent { color: #818cf8; }

.sw-logo-sub {
  font-size: 11px;
  font-weight: 500;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sw-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 22px;
}

/* ── Step indicator ── */
.sw-steps {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
}

.sw-step-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.12);
  background: transparent;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  transition: all 0.2s;
  flex-shrink: 0;
}

.sw-step-dot.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.sw-step-dot.done {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.sw-step-label {
  font-size: 11px;
  color: #475569;
  margin-left: 4px;
  font-weight: 500;
}

/* ── Step content ── */
.sw-step { display: flex; flex-direction: column; gap: 16px; }

.sw-title {
  font-size: 22px;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.025em;
  margin: 0;
}

.sw-sub {
  font-size: 13px;
  color: #64748b;
  margin: -8px 0 0;
  line-height: 1.5;
}

/* ── Fields ── */
.sw-fields { display: flex; flex-direction: column; gap: 12px; }

.sw-field { display: flex; flex-direction: column; gap: 5px; }

.sw-field label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sw-field-row {
  display: flex;
  gap: 10px;
}

.sw-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.sw-field-icon {
  position: absolute;
  left: 13px;
  color: #475569;
  pointer-events: none;
}

.sw-input-wrap input {
  width: 100%;
  height: 42px;
  padding: 0 40px 0 13px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  color: #f8fafc;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  box-sizing: border-box;
}

.sw-field-icon ~ input {
  padding-left: 38px;
}

.sw-input-wrap input:focus {
  border-color: rgba(99, 102, 241, 0.55);
  background: rgba(99, 102, 241, 0.04);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.sw-field.error .sw-input-wrap input {
  border-color: rgba(244, 63, 94, 0.5);
  background: rgba(244, 63, 94, 0.04);
}

.sw-field-err {
  font-size: 12px;
  color: #f43f5e;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sw-field-hint {
  font-size: 11px;
  color: #475569;
  margin: 0;
  line-height: 1.5;
}

.sw-eye {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 5px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.sw-eye:hover { color: #94a3b8; background: rgba(255,255,255,0.05); }

/* ── Toggle ── */
.sw-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: #94a3b8;
}

.sw-toggle input { display: none; }

.sw-toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  flex-shrink: 0;
  position: relative;
  transition: background 0.2s, border-color 0.2s;
}

.sw-toggle-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #475569;
  transition: transform 0.2s, background 0.2s;
}

.sw-toggle input:checked + .sw-toggle-track {
  background: rgba(99, 102, 241, 0.3);
  border-color: #6366f1;
}

.sw-toggle input:checked + .sw-toggle-track::after {
  transform: translateX(16px);
  background: #818cf8;
}

/* ── Section separator ── */
.sw-section-sep {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* ── SMTP test ── */
.sw-smtp-test {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.smtp-result {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 8px;
}

.smtp-result.ok {
  color: #10b981;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.smtp-result.err {
  color: #f43f5e;
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.2);
}

/* ── Advanced toggle ── */
.sw-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
  transition: color 0.15s;
  font-family: inherit;
}

.sw-advanced-toggle:hover { color: #94a3b8; }

.sw-advanced-toggle svg { transition: transform 0.2s; }
.sw-advanced-toggle svg.rotated { transform: rotate(90deg); }

.sw-advanced { display: flex; flex-direction: column; gap: 10px; }

.sw-select {
  width: 100%;
  height: 42px;
  padding: 0 13px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  color: #f8fafc;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  appearance: none;
}

.sw-select:focus {
  border-color: rgba(99, 102, 241, 0.55);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.sw-select option { background: #1d242f; color: #f8fafc; }

.sw-textarea {
  width: 100%;
  padding: 10px 13px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  color: #f8fafc;
  font-size: 12px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  line-height: 1.5;
}

.sw-textarea:focus {
  border-color: rgba(99, 102, 241, 0.55);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.sw-textarea::placeholder { color: #334155; font-size: 11px; }

/* ── Review ── */
.sw-review {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  overflow: hidden;
}

.sw-review-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  color: #475569;
}

.sw-review-row:last-child { border-bottom: none; }

.sw-review-key {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  min-width: 110px;
}

.sw-review-val {
  font-size: 12px;
  color: #94a3b8;
  word-break: break-all;
}

.sw-review-val.ok { color: #10b981; font-weight: 600; }

.sw-install-err {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #f43f5e;
  padding: 10px 14px;
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.2);
  border-radius: 10px;
}

/* ── Feature list ── */
.sw-feature-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.sw-feature {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.sw-feature svg { color: #6366f1; flex-shrink: 0; }

/* ── Navigation ── */
.sw-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding-top: 18px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.sw-nav.centered { justify-content: center; }

/* ── Buttons ── */
.sw-btn-primary {
  height: 44px;
  padding: 0 22px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  min-width: 140px;
  justify-content: center;
}

.sw-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px rgba(99, 102, 241, 0.45);
}

.sw-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.sw-btn-install {
  height: 46px;
  padding: 0 28px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4px 20px rgba(16, 185, 129, 0.35);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  flex: 1;
  justify-content: center;
}

.sw-btn-install:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 28px rgba(16, 185, 129, 0.5);
}

.sw-btn-install:disabled { opacity: 0.5; cursor: not-allowed; }

.sw-btn-back {
  height: 44px;
  padding: 0 16px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
}

.sw-btn-back:hover { background: rgba(255,255,255,0.05); color: #94a3b8; }

.sw-btn-outline {
  height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}

.sw-btn-outline:hover:not(:disabled) { background: rgba(255,255,255,0.05); color: #94a3b8; }
.sw-btn-outline:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Done screen ── */
.sw-done {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 40px 38px 32px;
}

.done-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 30px rgba(16, 185, 129, 0.15);
}

.done-title {
  font-size: 22px;
  font-weight: 800;
  color: #f8fafc;
  margin: 0;
  letter-spacing: -0.02em;
}

.done-sub {
  font-size: 13px;
  color: #64748b;
  margin: -6px 0 0;
}

.done-files {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 11px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.15);
  border-radius: 10px;
  padding: 8px 14px;
  width: 100%;
  box-sizing: border-box;
}

.done-files span { color: #475569; font-family: monospace; }

.done-restart-box {
  width: 100%;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 14px;
  padding: 16px 18px;
  text-align: left;
  box-sizing: border-box;
}

.done-restart-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #f59e0b;
  margin-bottom: 8px;
}

.done-restart-desc {
  font-size: 12px;
  color: #78716c;
  margin: 0 0 10px;
  line-height: 1.5;
}

.done-steps {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.done-steps li {
  font-size: 12px;
  color: #78716c;
  line-height: 1.5;
}

.poll-ready {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: #10b981;
  padding: 10px 16px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 10px;
  width: 100%;
  justify-content: center;
  box-sizing: border-box;
}

.poll-checking {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: #64748b;
  width: 100%;
  justify-content: center;
}

.poll-warn {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #f59e0b;
  padding: 10px 14px;
  background: rgba(245, 158, 11, 0.07);
  border: 1px solid rgba(245, 158, 11, 0.18);
  border-radius: 10px;
  width: 100%;
  justify-content: center;
  box-sizing: border-box;
}

/* ── Spinner ── */
.sw-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Footer ── */
.sw-footer {
  text-align: center;
  font-size: 11px;
  color: #1e293b;
  margin: 8px 0 0;
}

/* ── Transitions ── */
.sw-fade-enter-active, .sw-fade-leave-active { transition: opacity 0.2s ease; }
.sw-fade-enter-from, .sw-fade-leave-to { opacity: 0; }

.sw-slide-enter-active, .sw-slide-leave-active { transition: all 0.22s ease; overflow: hidden; }
.sw-slide-enter-from, .sw-slide-leave-to { opacity: 0; transform: translateX(16px); max-height: 0; }
.sw-slide-enter-to, .sw-slide-leave-from { opacity: 1; transform: translateX(0); max-height: 800px; }

@media (max-width: 560px) {
  .sw-card { padding: 26px 20px 22px; border-radius: 20px; }
  .sw-field-row { flex-direction: column; }
  .sw-feature-list { grid-template-columns: 1fr; }
}
</style>
