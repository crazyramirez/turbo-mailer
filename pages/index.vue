<script setup lang="ts">
import { ArrowRight } from "lucide-vue-next";

// Página de señuelo (Decoy) - No requiere autenticación
definePageMeta({ layout: false });

const config = useRuntimeConfig();
if (!config.public.ghostMode) {
  navigateTo('/login');
}

const isAuthed = useState<boolean | null>("isAuthed", () => null);
const showSetupWelcome = ref(false);
const portalKey = ref("");

const { t } = useI18n();

// Usamos useAsyncData para gestionar todo el estado inicial de forma síncrona para el SSR
// Esto evita parpadeos (flicker) ya que el HTML generado en el servidor ya vendrá con el estado correcto
const { data: initData } = await useAsyncData("index-init", async () => {
  // 1. Si ya está autenticado, no hay nada que mostrar aquí (el middleware o onMounted redirigirán)
  if (isAuthed.value) {
    return { seen: true, portalKey: "" };
  }

  // 2. Verificar en la DDBB si es la primera vez (consulta pública inicial)
  try {
    return await $fetch<{ seen: boolean; portalKey: string }>(
      "/api/ghost-status",
      {
        params: { public: "true" },
      },
    );
  } catch (e) {
    return { seen: true, portalKey: "" }; // Por defecto ocultar si hay error
  }
});

if (initData.value && !initData.value.seen && !isAuthed.value) {
  portalKey.value = initData.value.portalKey;
  showSetupWelcome.value = true;
}

onMounted(() => {
  // Redirección inmediata si ya está autenticado
  if (isAuthed.value) {
    navigateTo("/dashboard");
  }
});

function enterPortal() {
  showSetupWelcome.value = false;
  navigateTo(`/login?portal=${portalKey.value || "admin"}`);
}
</script>

<template>
  <div class="decoy-root">
    <!-- Decoy Content (Technical Node Status) -->
    <div class="status-container">
      <div class="pulse-ring"></div>
      <div class="status-dot"></div>
      <div class="status-text">
        <span class="node-id">{{ t("ghost.decoy_node") }}</span>
        <span class="node-status">{{ t("ghost.decoy_operational") }}</span>
      </div>
    </div>

    <div class="terminal-ghost">
      <p class="line">{{ t("ghost.decoy_ready") }}</p>
      <p class="line">{{ t("ghost.decoy_waiting") }}</p>
      <p class="line opacity-40">{{ t("ghost.decoy_encryption") }}</p>
    </div>

    <!-- First Run Welcome Overlay -->
    <GhostWelcomeModal v-if="showSetupWelcome && config.public.ghostMode" @close="enterPortal" />
  </div>
</template>

<style scoped>
.decoy-root {
  background: #03040a;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: "JetBrains Mono", "Courier New", monospace;
  color: #1e293b;
  overflow: hidden;
}

.status-container {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  z-index: 2;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 15px #10b981;
}

.pulse-ring {
  position: absolute;
  left: -6px;
  width: 20px;
  height: 20px;
  border: 1px solid #10b981;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.node-id {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #334155;
}

.node-status {
  font-size: 10px;
  font-weight: 600;
  color: #10b981;
  opacity: 0.8;
}

.terminal-ghost {
  margin-top: 40px;
  text-align: center;
}

.line {
  font-size: 10px;
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}

@keyframes pulse {
  0% {
    transform: scale(0.5);
    opacity: 0.8;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
