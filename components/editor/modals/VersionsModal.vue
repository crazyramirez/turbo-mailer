<script setup lang="ts">
import { ref, onMounted } from "vue";
import { X, History, RotateCcw, Loader2 } from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useIframeEngine } from "~/composables/useIframeEngine";
import { useToast } from "~/composables/useToast";

const props = defineProps<{ templateName: string }>();
const emit = defineEmits<{ close: [] }>();

const { htmlContent, currentTemplate } = useEditorState();
const { showToast } = useToast();

const versions = ref<{ ts: number; size: number }[]>([]);
const loading = ref(true);
const restoring = ref<number | null>(null);

onMounted(async () => {
  try {
    versions.value = await $fetch<any>("/api/template-versions", {
      query: { name: props.templateName },
    });
  } catch {
    versions.value = [];
  } finally {
    loading.value = false;
  }
});

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSize(bytes: number): string {
  return bytes > 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

// Loads the version into the canvas WITHOUT saving — the user reviews it and
// saves manually (or undoes by loading the template again).
async function restore(ts: number) {
  restoring.value = ts;
  try {
    const { content } = await $fetch<{ content: string }>(
      "/api/template-versions",
      { query: { name: props.templateName, ts } },
    );
    // Restoring history of a template other than the open one switches
    // the editing context — otherwise a save would clobber the wrong file
    if (currentTemplate.value !== props.templateName) {
      currentTemplate.value = props.templateName;
      localStorage.setItem("last_edited_template", props.templateName);
    }
    htmlContent.value = content;
    useIframeEngine().injectIframeContent();
    showToast(
      "Versión cargada en el lienzo — guarda para conservarla",
      "info",
    );
    emit("close");
  } catch {
    showToast("No se pudo cargar la versión", "error");
  } finally {
    restoring.value = null;
  }
}
</script>

<template>
  <div class="vm-overlay" @click.self="emit('close')">
    <div class="vm-modal">
      <div class="vm-header">
        <div class="vm-title">
          <History :size="16" />
          <span>Historial — {{ templateName }}</span>
        </div>
        <button class="vm-close" @click="emit('close')"><X :size="16" /></button>
      </div>

      <div v-if="loading" class="vm-empty">
        <Loader2 :size="18" class="spin" /> Cargando…
      </div>
      <div v-else-if="versions.length === 0" class="vm-empty">
        Sin versiones anteriores todavía.<br />
        <small
          >Se guarda una copia automática al editar (máx. 10, mínimo 5 min entre
          copias).</small
        >
      </div>
      <div v-else class="vm-list">
        <div v-for="v in versions" :key="v.ts" class="vm-row">
          <div class="vm-row-info">
            <span class="vm-date">{{ fmt(v.ts) }}</span>
            <span class="vm-size">{{ fmtSize(v.size) }}</span>
          </div>
          <button
            class="vm-restore"
            :disabled="restoring !== null"
            @click="restore(v.ts)"
          >
            <Loader2 v-if="restoring === v.ts" :size="12" class="spin" />
            <RotateCcw v-else :size="12" />
            Cargar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.vm-modal {
  width: 100%;
  max-width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #16182a);
  border: 1px solid var(--border, rgb(255 255 255 / 10%));
  border-radius: 16px;
  overflow: hidden;
}
.vm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border, rgb(255 255 255 / 10%));
}
.vm-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text, #fff);
  min-width: 0;
}
.vm-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vm-close {
  background: transparent;
  border: none;
  color: var(--text-dim, #64748b);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}
.vm-close:hover {
  color: #fff;
  background: rgb(255 255 255 / 8%);
}
.vm-empty {
  padding: 32px 20px;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim, #64748b);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.vm-list {
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.vm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border, rgb(255 255 255 / 8%));
  border-radius: 10px;
}
.vm-row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.vm-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--text, #e2e8f0);
}
.vm-size {
  font-size: 11px;
  color: var(--text-dim, #64748b);
}
.vm-restore {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgb(99 102 241 / 14%);
  border: 1px solid rgb(99 102 241 / 30%);
  color: #818cf8;
  font-size: 11px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.vm-restore:hover:not(:disabled) {
  background: rgb(99 102 241 / 25%);
}
.vm-restore:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.spin {
  animation: vmspin 0.8s linear infinite;
}
@keyframes vmspin {
  to {
    transform: rotate(360deg);
  }
}
</style>
