<script setup lang="ts">
import { onMounted } from "vue";
import "@/assets/css/main.css";
import "@/assets/css/bg-orbs.css";

import { useHtmlImport } from "~/composables/useHtmlImport";

import AppBackground from "~/components/dashboard/AppBackground.vue";
import DashboardToast from "~/components/dashboard/DashboardToast.vue";
import DashboardHeader from "~/components/dashboard/DashboardHeader.vue";
import StepperNav from "~/components/dashboard/StepperNav.vue";
import StepContactos from "~/components/dashboard/StepContactos.vue";
import StepAsunto from "~/components/dashboard/StepAsunto.vue";
import StepPlantilla from "~/components/dashboard/StepPlantilla.vue";
import LivePreview from "~/components/dashboard/LivePreview.vue";
import SendBar from "~/components/dashboard/SendBar.vue";
import ResultsOverlay from "~/components/dashboard/ResultsOverlay.vue";
import ResetModal from "~/components/dashboard/ResetModal.vue";
import TemplateLibraryModal from "~/components/dashboard/TemplateLibraryModal.vue";
import GlobalDialog from "~/components/dashboard/GlobalDialog.vue";

const { fetchInternalTemplates } = useHtmlImport();

useHead({
  link: [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
    },
  ],
});

onMounted(() => {
  fetchInternalTemplates();
});
</script>

<template>
  <div class="app-wrapper">
    <AppBackground />
    <DashboardToast />
    <DashboardHeader />

    <main class="main">
      <div class="layout-grid">
        <div class="config-side">
          <StepperNav />
          <StepContactos />
          <StepAsunto />
          <StepPlantilla />
        </div>
        <LivePreview />
      </div>
    </main>

    <SendBar />
    <ResultsOverlay />
    <ResetModal />
    <TemplateLibraryModal />
    <GlobalDialog />
  </div>
</template>

<style scoped>
.internal-library-trigger {
  margin-bottom: 24px;
}

.select-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 12px;
  letter-spacing: 0.05em;
}
.select-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}

.btn-browse-library {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.1),
    rgba(161, 63, 241, 0.1)
  );
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: var(--accent-light);
  padding: 16px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn-browse-library:hover {
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.2),
    rgba(161, 63, 241, 0.2)
  );
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(99, 102, 241, 0.2);
}

.btn-copy-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: var(--accent-light);
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn-copy-preview:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}
.btn-copy-preview svg {
  flex-shrink: 0;
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}
</style>
