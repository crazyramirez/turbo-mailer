<script setup lang="ts">
import { Rocket, Layout, RefreshCcw, LogOut } from 'lucide-vue-next'
import { useDashboardState } from '~/composables/useDashboardState'
import { useCampaignSender } from '~/composables/useCampaignSender'

const { emails, emailSubject, htmlBody } = useDashboardState()
const { resetAll, logout } = useCampaignSender()
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <div class="header-logo">
        <div class="logo-icon-wrapper">
          <Rocket :size="24" stroke-width="2.5" class="logo-icon-lucide" />
        </div>
        <div class="logo-text-group">
          <span class="logo-title">Turbo-Mailer <span class="logo-accent">PRO</span></span>
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
