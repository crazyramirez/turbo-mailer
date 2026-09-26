<script setup lang="ts">
import { CheckCircle, AlertCircle, MailX, Loader2 } from "lucide-vue-next";

const { t } = useI18n();
const route = useRoute();

// The page never unsubscribes on load: mail security scanners open every link
// they find, and would opt real subscribers out. The visitor confirms with a
// button (a POST), which scanners don't press.
const status = ref<"loading" | "confirm" | "ok" | "already" | "error">("loading");
const resubUrl = ref<string | null>(null);
const customMessage = ref<string | null>(null);
const maskedEmail = ref("");
const submitting = ref(false);

const sendId = computed(() => String(route.query.s ?? ""));
const token = computed(() => String(route.query.t ?? ""));

function setResub(resubToken?: string | null) {
  if (resubToken) resubUrl.value = `/resubscribe?s=${sendId.value}&t=${resubToken}`;
}

onMounted(async () => {
  if (!sendId.value || !token.value) {
    status.value = "error";
    return;
  }
  try {
    const res = await $fetch<any>("/api/unsubscribe", { query: { s: sendId.value, t: token.value } });
    maskedEmail.value = res.maskedEmail || "";
    if (res.status === "already") {
      customMessage.value = res.customMessage || null;
      setResub(res.resubToken);
      status.value = "already";
    } else if (res.status === "pending") {
      status.value = "confirm";
    } else {
      status.value = "error";
    }
  } catch {
    status.value = "error";
  }
});

async function confirmUnsubscribe() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const res = await $fetch<any>("/api/unsubscribe/one-click", {
      method: "POST",
      body: { s: sendId.value, t: token.value, source: "page" },
    });
    customMessage.value = res.customMessage || null;
    setResub(res.resubToken);
    status.value = res.status === "already" ? "already" : res.status === "ok" ? "ok" : "error";
  } catch {
    status.value = "error";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="unsub-page">
    <AppBackground />
    <div class="unsub-card">
      <div v-if="status === 'loading'" class="state">
        <div class="spinner" />
        <p>{{ t("common.loading") }}</p>
      </div>
      <div v-else-if="status === 'confirm'" class="state">
        <MailX :size="48" class="state-icon confirm-icon" />
        <h1>{{ t("unsubscribe_page.confirm_title") }}</h1>
        <p>
          {{ t("unsubscribe_page.confirm_message") }}
          <strong v-if="maskedEmail" class="masked">{{ maskedEmail }}</strong>
        </p>
        <button class="btn-confirm" :disabled="submitting" @click="confirmUnsubscribe">
          <Loader2 v-if="submitting" :size="15" class="spin" />
          {{ t("unsubscribe_page.confirm_button") }}
        </button>
        <NuxtLink
          :to="`/preferences?s=${sendId}&t=${token}`"
          class="link-prefs"
        >{{ t("unsubscribe_page.manage_preferences") }}</NuxtLink>
      </div>
      <div v-else-if="status === 'ok'" class="state success">
        <CheckCircle :size="48" class="state-icon" />
        <h1>{{ t("unsubscribe_page.title") }}</h1>
        <p>{{ customMessage || t("unsubscribe_page.message") }}</p>
        <NuxtLink v-if="resubUrl" :to="resubUrl" class="btn-resub">{{
          t("unsubscribe_page.resubscribe_link")
        }}</NuxtLink>
      </div>
      <div v-else-if="status === 'already'" class="state warn">
        <AlertCircle :size="48" class="state-icon" />
        <h1>{{ t("unsubscribe_page.title") }}</h1>
        <p>{{ customMessage || t("unsubscribe_page.already") }}</p>
        <NuxtLink v-if="resubUrl" :to="resubUrl" class="btn-resub">{{
          t("unsubscribe_page.resubscribe_link")
        }}</NuxtLink>
      </div>
      <div v-else class="state error">
        <AlertCircle :size="48" class="state-icon" />
        <h1>{{ t("common.error") }}</h1>
        <p>{{ t("unsubscribe_page.error") }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unsub-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #05060b;
  position: relative;
}
.unsub-card {
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

.btn-resub {
  margin-top: 8px;
  padding: 10px 24px;
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
  display: inline-block;
}
.btn-resub:hover {
  background: rgba(99, 102, 241, 0.25);
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
  background: #ef4444;
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
