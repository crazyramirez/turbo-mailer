<script setup lang="ts">
import { CheckCircle, AlertCircle } from "lucide-vue-next";

const { t } = useI18n();
const route = useRoute();

const status = ref<"loading" | "ok" | "already" | "rate_limited" | "error">("loading");
const rateLimitHours = ref(24);

onMounted(async () => {
  const sendId = route.query.s;
  const token = route.query.t;
  if (!sendId || !token) {
    status.value = "error";
    return;
  }
  try {
    const res = await $fetch<any>(`/api/resubscribe?s=${sendId}&t=${token}`);
    if (res.resetInHours) rateLimitHours.value = res.resetInHours;
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
  }
});
</script>

<template>
  <div class="resub-page">
    <AppBackground />
    <div class="resub-card">
      <div v-if="status === 'loading'" class="state">
        <div class="spinner" />
        <p>{{ t("common.loading") }}</p>
      </div>
      <div v-else-if="status === 'ok'" class="state success">
        <CheckCircle :size="48" class="state-icon" />
        <h1>{{ t("resubscribe_page.title") }}</h1>
        <p>{{ t("resubscribe_page.message") }}</p>
      </div>
      <div v-else-if="status === 'already'" class="state warn">
        <AlertCircle :size="48" class="state-icon" />
        <h1>{{ t("resubscribe_page.title") }}</h1>
        <p>{{ t("resubscribe_page.already") }}</p>
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

.btn-home {
  margin-top: 8px;
  padding: 10px 24px;
  background: var(--accent);
  color: #fff;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transition: all 0.2s;
  display: inline-block;
}
.btn-home:hover {
  filter: brightness(1.1);
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
</style>
