<script setup lang="ts">
import {
  Layout,
  RefreshCcw,
  LogOut,
  Users,
  BarChart2,
  Mail,
  Globe,
  Menu,
  X,
  LayoutDashboard,
} from "lucide-vue-next";
import { APP_VERSION } from "~/utils/version";
import { useRoute } from "vue-router";

const route = useRoute();
const navRef = ref<HTMLElement | null>(null);
const indicatorStyle = ref({
  width: "0px",
  transform: "translateX(0px)",
  opacity: "0",
});
const isInitialLoad = ref(true);

const { emails, emailSubject, htmlBody, lastSentCount } = useDashboardState();
const { resetAll, logout } = useCampaignSender();
const { t, locale, setLocale } = useI18n();

const menuOpen = ref(false);

function toggleLocale() {
  setLocale(locale.value === "es" ? "en" : "es");
}

function closeMenu() {
  menuOpen.value = false;
}

watch(menuOpen, (open) => {
  if (import.meta.client) {
    document.body.style.overflow = open ? "hidden" : "";
  }
});

onUnmounted(() => {
  if (import.meta.client) document.body.style.overflow = "";
});

onMounted(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeMenu();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", updateIndicator);
  onUnmounted(() => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", updateIndicator);
  });

  // Initialize indicator position
  setTimeout(updateIndicator, 100);
});

function updateIndicator() {
  if (!navRef.value) return;

  // Small delay to let Nuxt/Vue-Router apply classes
  nextTick(() => {
    setTimeout(() => {
      if (!navRef.value) return;

      // Try to find by class first
      let activeLink = navRef.value.querySelector(
        ".nav-link.router-link-active",
      ) as HTMLElement;

      // Fallback: match by current path if class is not yet applied
      if (!activeLink) {
        const links = navRef.value.querySelectorAll(".nav-link");
        activeLink = Array.from(links).find((link) => {
          const path = (link as HTMLAnchorElement).pathname;
          if (path === "/") return route.path === "/";
          return route.path.startsWith(path);
        }) as HTMLElement;
      }

      if (activeLink) {
        indicatorStyle.value = {
          width: `${activeLink.offsetWidth}px`,
          transform: `translateX(${activeLink.offsetLeft}px)`,
          opacity: "1",
        };

        // After the first position is set, enable transitions
        if (isInitialLoad.value) {
          setTimeout(() => {
            isInitialLoad.value = false;
          }, 50);
        }
      } else {
        indicatorStyle.value.opacity = "0";
      }
    }, 40);
  });
}

watch([() => route.path, () => locale.value], () => {
  updateIndicator();
});
</script>

<template>
  <header class="header" style="user-select: none">
    <div class="header-inner">
      <!-- Logo -->
      <div class="header-logo">
        <div class="logo-icon-wrapper">
          <img
            src="/images/icons/web-app-manifest-192x192.png"
            class="logo-img"
            alt="Logo"
          />
        </div>
        <div class="logo-text-group">
          <span class="logo-title">
            Turbo-Mailer
            <span class="version-badge">{{ APP_VERSION }}</span>
          </span>
          <span class="logo-sub">{{ t("app.subtitle") }}</span>
        </div>
      </div>

      <!-- Sent badge (hidden mobile to save space) -->
      <Transition name="fade-scale">
        <div v-if="lastSentCount > 0" class="sent-badge hide-mobile">
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

      <!-- Desktop nav -->
      <nav ref="navRef" class="header-nav hide-mobile">
        <!-- Active indicator pill -->
        <div
          class="nav-indicator"
          :class="{ 'no-transition': isInitialLoad }"
          :style="indicatorStyle"
        />

        <NuxtLink
          to="/"
          class="nav-link"
          active-class="router-link-active"
          exact-active-class="router-link-active"
          :title="t('nav.dashboard')"
        >
          <LayoutDashboard :size="15" stroke-width="2.5" />
          <span>{{ t("nav.dashboard") }}</span>
        </NuxtLink>
        <NuxtLink
          to="/contacts"
          class="nav-link"
          active-class="router-link-active"
          :title="t('nav.contacts')"
        >
          <Users :size="15" stroke-width="2.5" />
          <span>{{ t("nav.contacts") }}</span>
        </NuxtLink>
        <NuxtLink
          to="/campaigns"
          class="nav-link"
          active-class="router-link-active"
          :title="t('nav.campaigns')"
        >
          <Mail :size="15" stroke-width="2.5" />
          <span>{{ t("nav.campaigns") }}</span>
        </NuxtLink>
        <NuxtLink
          to="/analytics"
          class="nav-link"
          active-class="router-link-active"
          :title="t('nav.analytics')"
        >
          <BarChart2 :size="15" stroke-width="2.5" />
          <span>{{ t("nav.analytics") }}</span>
        </NuxtLink>
      </nav>

      <!-- Desktop right actions -->
      <div class="header-right">
        <button
          class="btn-lang hide-mobile"
          :title="locale === 'es' ? 'Switch to English' : 'Cambiar a Español'"
          @click="toggleLocale"
        >
          <Globe :size="18" stroke-width="2.5" />
          <span>{{ locale.toUpperCase() }}</span>
        </button>
        <NuxtLink to="/editor" class="btn-editor-link hide-mobile">
          <Layout :size="18" stroke-width="2.5" />
          <span>{{ t("nav.editor") }}</span>
        </NuxtLink>
        <button
          class="btn-logout hide-mobile"
          :title="t('nav.logout_full')"
          :aria-label="t('nav.logout_full')"
          @click="logout"
        >
          <LogOut :size="18" stroke-width="2.5" />
          <span>{{ t("nav.logout") }}</span>
        </button>

        <!-- Hamburger (mobile only) -->
        <button
          class="btn-hamburger"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <Transition name="icon-swap" mode="out-in">
            <X v-if="menuOpen" :key="'close'" :size="22" stroke-width="2.5" />
            <Menu v-else :key="'open'" :size="22" stroke-width="2.5" />
          </Transition>
        </button>
      </div>
    </div>
  </header>

  <!-- Mobile drawer (teleported to body to escape sticky context) -->
  <Teleport to="body">
    <Transition name="menu-overlay">
      <div
        v-if="menuOpen"
        class="mobile-overlay"
        aria-hidden="true"
        @click="closeMenu"
      />
    </Transition>

    <Transition name="menu-drawer">
      <div
        v-if="menuOpen"
        class="mobile-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('nav.dashboard')"
      >
        <!-- Drawer header -->
        <div class="drawer-header">
          <div class="drawer-logo">
            <div class="drawer-logo-icon">
              <img
                src="/images/icons/web-app-manifest-192x192.png"
                class="logo-img"
                alt="Logo"
              />
            </div>
            <div>
              <span class="drawer-title">Turbo-Mailer</span>
              <span class="drawer-sub">{{ t("app.subtitle") }}</span>
            </div>
          </div>
          <button
            class="drawer-close"
            aria-label="Close menu"
            @click="closeMenu"
          >
            <X :size="18" stroke-width="2.5" />
          </button>
        </div>

        <!-- Sent badge (mobile) -->
        <Transition name="fade-scale">
          <div v-if="lastSentCount > 0" class="drawer-sent-badge">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              style="width: 13px; height: 13px; flex-shrink: 0"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {{ t("app.sent_badge", { count: lastSentCount }) }}
          </div>
        </Transition>

        <!-- Primary nav -->
        <nav class="drawer-nav">
          <NuxtLink to="/" class="drawer-link" @click="closeMenu">
            <span class="drawer-link-icon">
              <LayoutDashboard :size="17" stroke-width="2" />
            </span>
            <span>{{ t("nav.dashboard") }}</span>
          </NuxtLink>
          <NuxtLink to="/contacts" class="drawer-link" @click="closeMenu">
            <span class="drawer-link-icon">
              <Users :size="17" stroke-width="2" />
            </span>
            <span>{{ t("nav.contacts") }}</span>
          </NuxtLink>
          <NuxtLink
            to="/campaigns"
            class="drawer-link"
            :class="{
              'router-link-active': $route.path.startsWith('/campaigns'),
            }"
            @click="closeMenu"
          >
            <span class="drawer-link-icon">
              <Mail :size="17" stroke-width="2" />
            </span>
            <span>{{ t("nav.campaigns") }}</span>
          </NuxtLink>
          <NuxtLink to="/analytics" class="drawer-link" @click="closeMenu">
            <span class="drawer-link-icon">
              <BarChart2 :size="17" stroke-width="2" />
            </span>
            <span>{{ t("nav.analytics") }}</span>
          </NuxtLink>
        </nav>

        <div class="drawer-divider" />

        <!-- Secondary actions -->
        <div class="drawer-actions">
          <NuxtLink to="/editor" class="drawer-action-row" @click="closeMenu">
            <span class="drawer-action-icon accent">
              <Layout :size="17" stroke-width="2" />
            </span>
            <span>{{ t("nav.editor") }}</span>
          </NuxtLink>

          <button
            class="drawer-action-row"
            @click="
              () => {
                toggleLocale();
                closeMenu();
              }
            "
          >
            <span class="drawer-action-icon">
              <Globe :size="17" stroke-width="2" />
            </span>
            <span>{{
              locale === "es" ? "Switch to English" : "Cambiar a Español"
            }}</span>
            <span class="drawer-lang-pill">{{ locale.toUpperCase() }}</span>
          </button>

          <button
            v-if="emails.length || emailSubject || htmlBody"
            class="drawer-action-row"
            @click="
              () => {
                resetAll();
                closeMenu();
              }
            "
          >
            <span class="drawer-action-icon warning">
              <RefreshCcw :size="17" stroke-width="2" />
            </span>
            <span>{{ t("nav.reset") }}</span>
          </button>
        </div>

        <div class="drawer-divider" />

        <!-- Logout -->
        <div class="drawer-footer">
          <button
            class="drawer-logout"
            @click="
              () => {
                logout();
                closeMenu();
              }
            "
          >
            <LogOut :size="17" stroke-width="2" />
            <span>{{ t("nav.logout") }}</span>
          </button>
          <span class="drawer-version">v{{ APP_VERSION }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.version-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 6px;
  border-radius: 6px;
  margin-left: 6px;
  vertical-align: middle;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
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
  position: relative;
}

.nav-indicator {
  position: absolute;
  top: 50%;
  left: 0;
  height: 38px; /* Matching nav-link height approx */
  margin-top: -19px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 60px;
  transition:
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.2s ease;
  pointer-events: none;
  z-index: 0;
}

.nav-indicator.no-transition {
  transition: none !important;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 60px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
  border: 1px solid transparent;
  position: relative;
  z-index: 1;
}

.nav-link:hover {
  color: var(--text);
}

.nav-link.router-link-active {
  color: var(--accent-light);
}

.btn-lang {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
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

/* ── Hamburger button ─────────────────────────────────── */
.btn-hamburger {
  display: none; /* hidden on desktop; shown via media query below */
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  touch-action: manipulation;
  flex-shrink: 0;
}

.btn-hamburger:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
  border-color: var(--border-hi);
}

@media (max-width: 1200px) {
  .btn-hamburger {
    display: flex;
  }
}

/* ── Mobile overlay ───────────────────────────────────── */
.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
  z-index: 500;
}

/* ── Mobile drawer ────────────────────────────────────── */
.mobile-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(85vw, 320px);
  background: rgba(8, 9, 20, 0.98);
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  border-left: 1px solid var(--border);
  z-index: 501;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: -24px 0 80px rgba(0, 0, 0, 0.5);
}

/* Drawer header */
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 18px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.drawer-logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.drawer-title {
  display: block;
  font-size: 15px;
  font-weight: 800;
  color: var(--text);
}

.drawer-sub {
  display: block;
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 2px;
}

.drawer-close {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.drawer-close:hover {
  background: rgba(255, 255, 255, 0.09);
  color: var(--text);
}

/* Drawer sent badge */
.drawer-sent-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #10b981;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 14px;
  margin: 12px 12px 0;
  border-radius: 12px;
}

/* Primary nav */
.drawer-nav {
  display: flex;
  flex-direction: column;
  padding: 12px 10px 8px;
  gap: 2px;
}

.drawer-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  transition: all 0.18s;
  min-height: 52px;
  border: 1px solid transparent;
  touch-action: manipulation;
}

.drawer-link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

.drawer-link.router-link-active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-light);
  border-color: rgba(99, 102, 241, 0.2);
}

.drawer-link.router-link-active .drawer-link-icon {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.35);
  color: var(--accent-light);
}

.drawer-link-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.18s;
}

/* Divider */
.drawer-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 10px;
  flex-shrink: 0;
}

/* Secondary actions */
.drawer-actions {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  gap: 2px;
}

.drawer-action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  cursor: pointer;
  background: transparent;
  border: none;
  width: 100%;
  min-height: 48px;
  transition: all 0.18s;
  text-align: left;
  touch-action: manipulation;
}

.drawer-action-row:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

.drawer-action-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.18s;
}

.drawer-action-icon.accent {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.25);
  color: var(--accent-light);
}

.drawer-action-icon.warning {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.25);
  color: #f59e0b;
}

.drawer-lang-pill {
  margin-left: auto;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-dim);
  letter-spacing: 0.05em;
}

/* Footer: logout + version */
.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 20px;
  margin-top: auto;
  flex-shrink: 0;
}

.drawer-logout {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.07);
  border: 1px solid rgba(239, 68, 68, 0.18);
  cursor: pointer;
  min-height: 44px;
  transition: all 0.18s;
  touch-action: manipulation;
}

.drawer-logout:hover {
  background: rgba(239, 68, 68, 0.14);
  border-color: rgba(239, 68, 68, 0.35);
}

.drawer-version {
  font-size: 10px;
  color: var(--text-dim);
  font-weight: 600;
  letter-spacing: 0.05em;
  padding-right: 8px;
}

/* ── Transitions ──────────────────────────────────────── */
.menu-overlay-enter-active,
.menu-overlay-leave-active {
  transition: opacity 0.25s ease;
}
.menu-overlay-enter-from,
.menu-overlay-leave-to {
  opacity: 0;
}

.menu-drawer-enter-active,
.menu-drawer-leave-active {
  transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}
.menu-drawer-enter-from,
.menu-drawer-leave-to {
  transform: translateX(100%);
}

.icon-swap-enter-active,
.icon-swap-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.icon-swap-enter-from {
  opacity: 0;
  transform: rotate(-45deg) scale(0.7);
}
.icon-swap-leave-to {
  opacity: 0;
  transform: rotate(45deg) scale(0.7);
}
</style>
