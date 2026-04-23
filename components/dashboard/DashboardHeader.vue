<script setup lang="ts">
import {
  Layout,
  RefreshCcw,
  LogOut,
  Users,
  BarChart2,
  Mail,
  Globe,
} from "lucide-vue-next";
import { APP_VERSION } from "~/utils/version";

const { emails, emailSubject, htmlBody, lastSentCount } = useDashboardState();
const { resetAll, logout } = useCampaignSender();
const { t, locale, setLocale } = useI18n();

function toggleLocale() {
  setLocale(locale.value === "es" ? "en" : "es");
}
</script>

<template>
  <header class="header" style="user-select: none">
    <div class="header-inner">
      <div class="header-logo">
        <div class="logo-icon-wrapper">
          <img
            src="/images/icons/web-app-manifest-192x192.png"
            class="logo-img"
            alt="Logo"
          />
        </div>
        <div class="logo-text-group">
          <span class="logo-title"
            >Turbo-Mailer <span class="logo-accent">PRO</span>
            <span class="version-badge">{{ APP_VERSION }}</span></span
          >
          <span class="logo-sub">{{ t("app.subtitle") }}</span>
        </div>
      </div>

      <Transition name="fade-scale">
        <div v-if="lastSentCount > 0" class="sent-badge">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {{ t("app.sent_badge", { count: lastSentCount }) }}
        </div>
      </Transition>

      <nav class="header-nav hide-mobile">
        <NuxtLink to="/" class="nav-link" :title="t('nav.dashboard')">
          <Mail :size="15" stroke-width="2.5" />
          <span>{{ t("nav.dashboard") }}</span>
        </NuxtLink>
        <NuxtLink to="/contacts" class="nav-link" :title="t('nav.contacts')">
          <Users :size="15" stroke-width="2.5" />
          <span>{{ t("nav.contacts") }}</span>
        </NuxtLink>
        <NuxtLink to="/campaigns" class="nav-link" :title="t('nav.campaigns')">
          <Mail :size="15" stroke-width="2.5" />
          <span>{{ t("nav.campaigns") }}</span>
        </NuxtLink>
        <NuxtLink to="/analytics" class="nav-link" :title="t('nav.analytics')">
          <BarChart2 :size="15" stroke-width="2.5" />
          <span>{{ t("nav.analytics") }}</span>
        </NuxtLink>
      </nav>

      <div class="header-right">
        <!-- Language switcher -->
        <button
          @click="toggleLocale"
          class="btn-lang hide-mobile"
          :title="locale === 'es' ? 'Switch to English' : 'Cambiar a Español'"
        >
          <Globe :size="14" stroke-width="2.5" />
          <span>{{ locale.toUpperCase() }}</span>
        </button>

        <!-- Desktop buttons -->
        <NuxtLink to="/editor" class="btn-editor-link hide-mobile">
          <Layout :size="18" stroke-width="2.5" />
          <span>{{ t("nav.editor") }}</span>
        </NuxtLink>
        <button
          @click="logout"
          class="btn-logout hide-mobile"
          :title="t('nav.logout_full')"
          :aria-label="t('nav.logout_full')"
        >
          <LogOut :size="16" stroke-width="2.5" />
          <span>{{ t("nav.logout") }}</span>
        </button>

        <!-- Mobile buttons -->
        <button
          @click="toggleLocale"
          class="header-btn-reset show-mobile"
          :title="locale === 'es' ? 'EN' : 'ES'"
        >
          <Globe :size="18" stroke-width="2.5" />
        </button>
        <NuxtLink
          to="/editor"
          class="header-btn-editor show-mobile"
          :title="t('nav.editor')"
        >
          <Layout :size="18" stroke-width="2.5" />
        </NuxtLink>
        <button
          v-if="emails.length || emailSubject || htmlBody"
          @click="resetAll"
          class="header-btn-reset show-mobile"
          :title="t('nav.reset')"
        >
          <RefreshCcw :size="18" stroke-width="2.5" />
        </button>
        <button
          @click="logout"
          class="header-btn-reset show-mobile"
          :title="t('nav.logout_full')"
          :aria-label="t('nav.logout_full')"
        >
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

.sent-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 20px;
}

.sent-badge svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  border-color: var(--border);
}

.nav-link.router-link-active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-light);
  border-color: rgba(99, 102, 241, 0.2);
}

.btn-lang {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 12px 20px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.05em;
}

.btn-lang:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text);
  border-color: var(--border-hi);
}
</style>
