<script setup lang="ts">
import { Layout, RefreshCcw, LogOut } from 'lucide-vue-next'
import { useDashboardState } from '~/composables/useDashboardState'
import { useCampaignSender } from '~/composables/useCampaignSender'
import { APP_VERSION } from '~/utils/version'

const { emails, emailSubject, htmlBody } = useDashboardState()
const { resetAll, logout } = useCampaignSender()
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <div class="header-logo">
        <div class="logo-icon-wrapper">
          <img src="/images/icons/web-app-manifest-192x192.png" class="logo-img" alt="Logo" />
        </div>
        <div class="logo-text-group">
          <span class="logo-title">Turbo-Mailer <span class="logo-accent">PRO</span> <span class="version-badge">{{ APP_VERSION }}</span></span>
          <span class="logo-sub">Dashboard de Envío Inteligente</span>
        </div>
      </div>

      <div class="header-right">
        <!-- Desktop buttons -->
        <NuxtLink to="/editor" class="btn-editor-link hide-mobile">
          <Layout :size="18" stroke-width="2.5" />
          <span>Editor PRO</span>
        </NuxtLink>
        <div class="status-pill hide-mobile">
          <span class="status-dot"></span>
          <span>SMTP Express</span>
        </div>
        <button @click="logout" class="btn-logout hide-mobile" title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut :size="16" stroke-width="2.5" />
          <span>Salir</span>
        </button>

        <!-- Mobile buttons -->
        <NuxtLink to="/editor" class="header-btn-editor show-mobile" title="Editor de Plantillas">
          <Layout :size="18" stroke-width="2.5" />
        </NuxtLink>
        <button
          v-if="emails.length || emailSubject || htmlBody"
          @click="resetAll"
          class="header-btn-reset show-mobile"
          title="Reiniciar"
        >
          <RefreshCcw :size="18" stroke-width="2.5" />
        </button>
        <button @click="logout" class="header-btn-reset show-mobile" title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut :size="18" stroke-width="2.5" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.version-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 6px;
  vertical-align: middle;
  border: 1px solid var(--border);
}

.logo-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 800;
}
</style>
