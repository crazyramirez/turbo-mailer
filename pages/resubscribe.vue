<script setup lang="ts">
import { CheckCircle, AlertCircle, MailCheck, Loader2 } from "lucide-vue-next";

const { t } = useI18n();
const route = useRoute();

// Like unsubscribing, re-subscribing requires pressing the button: the link
// travels in the unsubscribe confirmation email, where scanners pre-open it.
const status = ref<"loading" | "confirm" | "ok" | "already" | "rate_limited" | "error">("loading");
const rateLimitHours = ref(24);
const customMessage = ref<string | null>(null);
const maskedEmail = ref("");
const submitting = ref(false);

const sendId = computed(() => String(route.query.s ?? ""));
const token = computed(() => String(route.query.t ?? ""));

onMounted(async () => {
  if (!sendId.value || !token.value) {
    status.value = "error";
    return;
  }
  try {
    const res = await $fetch<any>("/api/resubscribe", { query: { s: sendId.value, t: token.value } });
    maskedEmail.value = res.maskedEmail || "";
    status.value = res.status === "already" ? "already" : res.status === "pending" ? "confirm" : "error";
  } catch {
    status.value = "error";
  }
});

async function confirmResubscribe() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const res = await $fetch<any>("/api/resubscribe", {
      method: "POST",
      body: { s: sendId.value, t: token.value },
    });
    if (res.resetInHours) rateLimitHours.value = res.resetInHours;
    if (res.customMessage) customMessage.value = res.customMessage;
    status.value =
      res.status === "ok"
        ? "ok"
        : res.status === "already"
          ? "already"
          : res.status === "rate_limited"
            ? "rate_limited"
            : "error";
  } catch {
    status.value = "error";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="resub-page">
    <AppBackground />
    <div class="resub-card">
      <div v-if="status === 'loading'" class="state">
        <div class="spinner" />
        <p>{{ t("common.loading") }}</p>
      </div>
      <div v-else-if="status === 'confirm'" class="state">
        <MailCheck :size="48" class="state-icon confirm-icon" />
        <h1>{{ t("resubscribe_page.confirm_title") }}</h1>
        <p>
          {{ t("resubscribe_page.confirm_message") }}
          <strong v-if="maskedEmail" class="masked">{{ maskedEmail }}</strong>
        </p>
        <button class="btn-confirm" :disabled="submitting" @click="confirmResubscribe">
          <Loader2 v-if="submitting" :size="15" class="spin" />
          {{ t("resubscribe_page.confirm_button") }}
        </button>
      </div>
      <div v-else-if="status === 'ok'" class="state success">
        <CheckCircle :size="48" class="state-icon" />
        <h1>{{ t("resubscribe_page.title") }}</h1>
        <p>{{ customMessage || t("resubscribe_page.message") }}</p>
      </div>
      <div v-else-if="status === 'already'" class="state warn">
        <AlertCircle :size="48" class="state-icon" />
        <h1>{{ t("resubscribe_page.title") }}</h1>
        <p>{{ customMessage || t("resubscribe_page.already") }}</p>
      </div>
      <div v-else-if="status === 'rate_limited'" class="state error">
        <AlertCircle :size="48" class="state-icon" />
        <h1>{{ t("common.error") }}</h1>
        <p>{{ t("resubscribe_page.rate_limited", { hours: String(rateLimitHours) }) }}</p>
      </div>
      <div v-else class="state error">
        <AlertCircle :size="48" class="state-icon" />
        <h1>{{ t("common.error") }}</h1>
        <p>{{ t("resubscribe_page.error") }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resub-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #05060b;
  position: relative;
}
.resub-card {
  position: relative;
  z-index: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 48px;
  max-width: 420px;
  width: 90%;
  text-align: center;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.state-icon {
  opacity: 0.8;
}
.state.success .state-icon {
  color: #10b981;
}
.state.warn .state-icon {
  color: #f59e0b;
}
.state.error .state-icon {
  color: #ef4444;
}
.state h1 {
  font-size: 22px;
  font-weight: 800;
}
.state p {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.confirm-icon {
  color: var(--accent);
}
.masked {
  display: block;
  margin-top: 6px;
  color: var(--text);
}
.btn-confirm {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  background: var(--accent, #6366f1);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-confirm:disabled {
  opacity: 0.6;
  cursor: default;
}
.link-prefs {
  font-size: 13px;
  color: var(--text-muted);
  text-decoration: underline;
}
.spin {
  animation: spin 0.8s linear infinite;
}
</style>
