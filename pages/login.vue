<template>
  <div class="login-wrapper">
    <!-- Ghost Mode First Run Welcome -->
    <GhostWelcomeModal
      v-if="showSetupWelcome"
      @close="showSetupWelcome = false"
    />

    <!-- Ambient background -->
    <div class="login-bg" aria-hidden="true">
      <div class="bg-grid"></div>
      <div class="bg-orb bg-orb-1"></div>
      <div class="bg-orb bg-orb-2"></div>
      <div class="bg-orb bg-orb-3"></div>
    </div>

    <template v-if="showPortal">
      <!-- Card -->
      <div class="login-card" :class="{ shake: shaking }">
        <!-- Logo -->
        <div class="login-logo">
          <div class="logo-icon-wrap">
            <img
              src="/images/icons/web-app-manifest-192x192.png"
              class="logo-img"
              alt="Logo"
            />
          </div>
          <div class="logo-text-group">
            <span class="logo-title">
              Turbo-Mailer <span class="logo-accent">PRO</span>
              <span class="version-tag">{{ APP_VERSION }}</span>
            </span>
            <span class="logo-sub">Acceso seguro</span>
          </div>
        </div>

        <!-- Divider -->
        <div class="card-divider"></div>

        <!-- Heading -->
        <div class="login-heading">
          <h1 class="login-h1">Bienvenido</h1>
          <p class="login-desc">Introduce tu clave de acceso para continuar</p>
        </div>

        <!-- Form -->
        <form @submit.prevent="submit" class="login-form" novalidate>
          <div class="field-group" :class="{ 'field-error': errorMsg }">
            <label for="password" class="field-label">Contraseña</label>
            <div class="field-input-wrap">
              <Lock
                :size="16"
                stroke-width="2"
                class="field-icon"
                aria-hidden="true"
              />
              <input
                id="password"
                ref="inputRef"
                v-model="password"
                :type="showPass ? 'text' : 'password'"
                class="field-input"
                placeholder="••••••••••••"
                autocomplete="current-password"
                :disabled="loading || blocked"
                aria-label="Contraseña de acceso"
                aria-describedby="error-msg"
                @keydown.enter.prevent="submit"
              />
              <button
                type="button"
                class="field-eye"
                :aria-label="
                  showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'
                "
                @click="showPass = !showPass"
                tabindex="0"
              >
                <Eye v-if="!showPass" :size="16" stroke-width="2" />
                <EyeOff v-else :size="16" stroke-width="2" />
              </button>
            </div>

            <!-- Error message -->
            <Transition name="err-fade">
              <div
                v-if="errorMsg"
                id="error-msg"
                class="error-msg"
                role="alert"
                aria-live="assertive"
              >
                <AlertTriangle :size="13" stroke-width="2.5" />
                <span>{{ errorMsg }}</span>
              </div>
            </Transition>
          </div>

          <!-- Attempts bar -->
          <Transition name="err-fade">
            <div
              v-if="
                remaining !== null &&
                remaining < 10 &&
                remaining > 0 &&
                !blocked
              "
              class="attempts-bar"
            >
              <div class="attempts-track">
                <div
                  class="attempts-fill"
                  :style="{ width: `${(remaining / 10) * 100}%` }"
                ></div>
              </div>
              <span class="attempts-label"
                >{{ remaining }} intentos restantes</span
              >
            </div>
          </Transition>

          <!-- Block countdown -->
          <Transition name="err-fade">
            <div v-if="blocked" class="block-notice">
              <ShieldOff :size="14" stroke-width="2.5" />
              <span>IP bloqueada {{ countdownLabel }}</span>
            </div>
          </Transition>

          <!-- CTA -->
          <button
            type="submit"
            class="btn-login"
            :disabled="loading || blocked || !password"
            :aria-busy="loading"
          >
            <span v-if="!loading" class="btn-label">
              <LogIn :size="16" stroke-width="2.5" />
              Acceder
            </span>
            <span v-else class="btn-spinner" aria-label="Verificando...">
              <span class="spinner"></span>
              Verificando…
            </span>
          </button>
        </form>

        <!-- Footer -->
        <p class="login-footer">
          Turbo-Mailer {{ APP_VERSION }} &mdash; acceso privado
        </p>
      </div>
    </template>

    <template v-else>
      <div class="ghost-404">
        <h1>{{ t("ghost.decoy_404_title") }}</h1>
        <p>{{ t("ghost.decoy_404_msg") }}</p>
        <hr class="ghost-hr" />
        <p class="ghost-server">
          {{ t("ghost.decoy_server_info") }}
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import {
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  ShieldOff,
  LogIn,
} from "lucide-vue-next";
import { APP_VERSION } from "@/utils/version";
import "@/assets/css/main.css";
import "@/assets/css/bg-orbs.css";

definePageMeta({ layout: false });

const password = ref("");
const showPass = ref(false);
const loading = ref(false);
const errorMsg = ref("");
const shaking = ref(false);
const remaining = ref<number | null>(null);
const blocked = ref(false);
const countdownSec = ref(0);
const countdownLabel = ref("");
const inputRef = ref<HTMLInputElement>();
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const route = useRoute();
const config = useRuntimeConfig();
const isAuthed = useState<boolean | null>("isAuthed", () => null);

const showSetupWelcome = ref(false);

const { t } = useI18n();

// Constante secreta para el acceso configurada en .env
const ACCESS_KEY = config.public.portalKey;
const showPortal = computed(
  () => route.query.portal === ACCESS_KEY || isAuthed.value,
);

onMounted(async () => {
  if (showPortal.value) {
    try {
      const data = await $fetch<{ seen: boolean }>("/api/ghost-status", {
        params: { portal: ACCESS_KEY },
      });
      if (!data.seen) {
        showSetupWelcome.value = true;
      }
    } catch (e) {
      // Si hay error (ej. 404), simplemente no mostramos el mensaje
      console.error("Error fetching ghost status:", e);
    }
  }
});

function triggerShake() {
  shaking.value = true;
  setTimeout(() => {
    shaking.value = false;
  }, 600);
}

function startCountdown(sec: number) {
  blocked.value = true;
  countdownSec.value = sec;
  updateLabel();
  countdownTimer = setInterval(() => {
    countdownSec.value--;
    if (countdownSec.value <= 0) {
      stopCountdown();
      remaining.value = 10;
    } else {
      updateLabel();
    }
  }, 1000);
}

function stopCountdown() {
  blocked.value = false;
  countdownSec.value = 0;
  countdownLabel.value = "";
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function updateLabel() {
  const m = Math.floor(countdownSec.value / 60);
  const s = countdownSec.value % 60;
  countdownLabel.value =
    m > 0 ? `— ${m}m ${s.toString().padStart(2, "0")}s` : `— ${s}s`;
}

async function submit() {
  if (loading.value || blocked.value || !password.value) return;
  loading.value = true;
  errorMsg.value = "";

  try {
    await $fetch("/api/auth/login", {
      method: "POST",
      body: { password: password.value },
    });
    isAuthed.value = true;
    await navigateTo("/dashboard");
  } catch (err: any) {
    const data = err?.data?.data ?? err?.response?._data?.data ?? {};
    const msg = err?.data?.message ?? err?.message ?? "Error inesperado";

    if (err?.status === 429 || err?.statusCode === 429) {
      const sec = data?.retryAfterSec ?? 900;
      startCountdown(sec);
      errorMsg.value = msg;
    } else {
      remaining.value = data?.remaining ?? null;
      errorMsg.value = msg;
      triggerShake();
      password.value = "";
      await nextTick();
      inputRef.value?.focus();
    }
  } finally {
    loading.value = false;
  }
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});
</script>

<style scoped>
/* ── Layout ── */
.login-wrapper {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #03040a;
  font-family: "Plus Jakarta Sans", sans-serif;
}

/* ── Background ── */
.login-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

/* ── Card ── */
.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 28px;
  padding: 42px 42px;
  backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    0 0 0 1px rgba(99, 102, 241, 0.08),
    0 32px 80px -16px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: box-shadow 0.3s ease;
}

.login-card:focus-within {
  box-shadow:
    0 0 0 1px rgba(99, 102, 241, 0.2),
    0 32px 80px -16px rgba(0, 0, 0, 0.7),
    0 0 40px rgba(99, 102, 241, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* ── Shake animation ── */
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-8px);
  }
  40% {
    transform: translateX(7px);
  }
  60% {
    transform: translateX(-5px);
  }
  80% {
    transform: translateX(4px);
  }
}

.shake {
  animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

/* ── Logo ── */
.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  text-align: center;
}

.logo-icon-wrap {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.4);
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.logo-title {
  font-size: 26px;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.02em;
  margin-bottom: 10px;
}

.logo-accent {
  color: #818cf8;
}

.version-tag {
  font-size: 10px;
  font-weight: 500;
  color: #475569;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 4px;
  vertical-align: middle;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.logo-sub {
  font-size: 11px;
  font-weight: 500;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Divider ── */
.card-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 28px;
}

/* ── Heading ── */
.login-heading {
  margin-bottom: 28px;
}

.login-h1 {
  font-size: 26px;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.025em;
  margin: 0 0 6px;
}

.login-desc {
  font-size: 13px;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}

/* ── Form ── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.field-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 14px;
  color: #475569;
  pointer-events: none;
  flex-shrink: 0;
}

.field-input {
  width: 100%;
  height: 48px;
  padding: 0 44px 0 40px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  font-size: 15px;
  font-family: inherit;
  color: #f8fafc;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
  letter-spacing: 0.04em;
  box-sizing: border-box;
}

.field-input::placeholder {
  color: #334155;
  letter-spacing: 0.1em;
}

.field-input:hover:not(:disabled) {
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(99, 102, 241, 0.03);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.07);
}

.field-input:focus {
  border-color: rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.05);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.field-input:disabled {
  opacity: 0.45;
}

.field-group.field-error .field-input {
  border-color: rgba(244, 63, 94, 0.5);
  background: rgba(244, 63, 94, 0.04);
}

.field-eye {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: #475569;
  display: flex;
  align-items: center;
  border-radius: 8px;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.field-eye:hover {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.06);
}
.field-eye:focus-visible {
  outline: 2px solid rgba(99, 102, 241, 0.5);
}

/* ── Error ── */
.error-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #f43f5e;
  padding: 8px 12px;
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.15);
  border-radius: 10px;
}

.err-fade-enter-active,
.err-fade-leave-active {
  transition: all 0.25s ease;
}
.err-fade-enter-from,
.err-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Attempts bar ── */
.attempts-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.attempts-track {
  flex: 1;
  height: 3px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 99px;
  overflow: hidden;
}

.attempts-fill {
  height: 100%;
  background: linear-gradient(90deg, #f43f5e, #fb923c);
  border-radius: 99px;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.attempts-label {
  font-size: 11px;
  font-weight: 600;
  color: #f43f5e;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

/* ── Block notice ── */
.block-notice {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: #fb923c;
  padding: 10px 12px;
  background: rgba(251, 146, 60, 0.07);
  border: 1px solid rgba(251, 146, 60, 0.18);
  border-radius: 10px;
}

/* ── CTA Button ── */
.btn-login {
  height: 50px;
  width: 100%;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%);
  color: #fff;
  box-shadow:
    0 4px 20px rgba(99, 102, 241, 0.35),
    0 1px 0 rgba(255, 255, 255, 0.1) inset;
  transition:
    transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.18s ease;
  letter-spacing: -0.01em;
  margin-top: 4px;
}

.btn-login:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 8px 32px rgba(99, 102, 241, 0.5),
    0 1px 0 rgba(255, 255, 255, 0.15) inset;
}

.btn-login:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
}

.btn-login:disabled {
  opacity: 0.4;
  transform: none;
  box-shadow: none;
}

.btn-login:focus-visible {
  outline: 2px solid rgba(99, 102, 241, 0.7);
  outline-offset: 3px;
}

.btn-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-spinner {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Spinner ── */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Footer ── */
.login-footer {
  text-align: center;
  font-size: 11px;
  color: #1e293b;
  margin: 20px 0 0;
  letter-spacing: 0.02em;
}

/* ── Ghost 404 ── */
.ghost-404 {
  text-align: left;
  max-width: 600px;
  color: #fff;
  padding: 40px;
  font-family: "Times New Roman", serif;
}
.ghost-404 h1 {
  font-size: 32px;
  margin-bottom: 10px;
}
.ghost-404 p {
  font-size: 16px;
}
.ghost-hr {
  margin: 20px 0;
  border: 0;
  border-top: 1px solid #444;
}
.ghost-server {
  font-style: italic;
  color: #888;
}

/* ── Responsive ── */
@media (max-width: 440px) {
  .login-card {
    padding: 28px 20px 24px;
    border-radius: 22px;
  }
  .login-h1 {
    font-size: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bg-orb,
  .spinner {
    animation: none;
  }
  .btn-login,
  .field-input,
  .field-eye {
    transition: none;
  }
}
</style>
