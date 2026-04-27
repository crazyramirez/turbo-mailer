<script setup lang="ts">
import { Shield, Copy, Check, ArrowRight, Info } from "lucide-vue-next";

const { t } = useI18n();
const emit = defineEmits(["close"]);
const config = useRuntimeConfig();
const portalUrl = computed(() => {
  if (import.meta.client) {
    return `${window.location.origin}/login?portal=${config.public.portalKey}`;
  }
  return "";
});

const copied = ref(false);
function copyUrl() {
  if (import.meta.client) {
    navigator.clipboard.writeText(portalUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  }
}

async function dismiss() {
  try {
    // Guardar en la DDBB que ya se ha visto
    await $fetch('/api/ghost-status', {
      method: 'POST',
      body: { portal: config.public.portalKey }
    });
  } catch (e) {
    console.error("Error saving ghost status:", e);
  }
  emit("close");
}
</script>

<template>
  <Transition name="fade-ghost">
    <div class="ghost-setup-overlay">
      <div class="ghost-setup-card">
        <div class="ghost-shield-badge">
          <Shield :size="32" />
        </div>
        
        <div class="ghost-setup-content">
          <h2>{{ t('ghost.title') }}</h2>
          <p>{{ t('ghost.portal_subtitle') }}</p>
          
          <div class="ghost-url-box" @click="copyUrl">
            <code>{{ portalUrl }}</code>
            <component :is="copied ? Check : Copy" :size="14" :class="{ 'text-green': copied }" />
          </div>

          <ul class="ghost-features">
            <li><span>🛡️</span> <strong>{{ t('ghost.feature_invisible') }}:</strong> {{ t('ghost.feature_invisible_desc') }}</li>
            <li><span>🔑</span> <strong>{{ t('ghost.feature_protected') }}:</strong> {{ t('ghost.feature_protected_desc') }}</li>
            <li><span>🚀</span> <strong>{{ t('ghost.feature_secure') }}:</strong> {{ t('ghost.feature_secure_desc') }}</li>
          </ul>
          
          <div class="ghost-once-notice">
            <Info :size="14" />
            <p>{{ t('ghost.once_notice') }}</p>
          </div>
        </div>

        <button class="btn-ghost-enter" @click="dismiss">
          <span>{{ t('ghost.btn_enter') }}</span>
          <ArrowRight :size="18" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ghost-setup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(12px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.ghost-setup-card {
  background: #0a0c14;
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 28px;
  padding: 40px;
  max-width: 440px;
  width: 100%;
  text-align: center;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.7);
}

.ghost-shield-badge {
  width: 72px;
  height: 72px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 28px;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.ghost-setup-content h2 {
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 12px;
}

.ghost-setup-content p {
  font-size: 15px;
  color: #94a3b8;
  line-height: 1.6;
}

.ghost-url-box {
  background: #03040a;
  border: 1px dashed rgba(99, 102, 241, 0.3);
  border-radius: 14px;
  padding: 16px;
  margin: 24px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s;
}

.ghost-url-box:hover {
  border-color: #6366f1;
  background: #05060b;
}

.ghost-url-box code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #10b981;
  word-break: break-all;
}

.ghost-features {
  list-style: none;
  padding: 0;
  margin: 0 0 32px;
  text-align: left;
}

.ghost-features li {
  display: flex;
  gap: 12px;
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 12px;
}



.ghost-once-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.05);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 12px;
  text-align: left;
  margin-bottom: 24px;
}

.ghost-once-notice svg {
  color: #f59e0b;
  flex-shrink: 0;
  margin-top: 2px;
}

.ghost-once-notice p {
  font-size: 12px !important;
  color: #fbbf24 !important;
  margin: 0 !important;
  line-height: 1.5 !important;
}

.btn-ghost-enter {
  width: 100%;
  padding: 16px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 14px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s;
}

.btn-ghost-enter:hover {
  background: #4f46e5;
  transform: translateY(-1px);
}

.text-green {
  color: #10b981;
}

.fade-ghost-enter-active, .fade-ghost-leave-active {
  transition: opacity 0.5s ease;
}
.fade-ghost-enter-from, .fade-ghost-leave-to {
  opacity: 0;
}
</style>
