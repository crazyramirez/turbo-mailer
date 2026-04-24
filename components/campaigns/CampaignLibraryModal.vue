<script setup lang="ts">
import { ref, onMounted } from "vue";
import { X, Check } from "lucide-vue-next";

const emit = defineEmits<{
  select: [html: string, name: string];
  close: [];
}>();

interface Tpl {
  name: string;
  path: string;
}
const templates = ref<Tpl[]>([]);
const loading = ref(true);
const picking = ref("");

onMounted(async () => {
  templates.value = await $fetch<Tpl[]>("/api/templates");
  loading.value = false;
});

async function pick(name: string) {
  if (picking.value) return;
  picking.value = name;
  try {
    const data = await $fetch<{ content: string }>(
      `/api/templates?name=${encodeURIComponent(name)}`,
    );
    emit("select", data.content, name);
  } finally {
    picking.value = "";
  }
}
</script>

<template>
  <div class="modal-overlay glass-modal" @click.self="emit('close')">
    <div class="lib-window">
      <div class="lib-header">
        <div>
          <h2>Biblioteca de Plantillas</h2>
          <p>Selecciona un diseño para esta campaña</p>
        </div>
        <button @click="emit('close')" class="btn-close">
          <X :size="18" />
        </button>
      </div>

      <div class="lib-body">
        <div v-if="loading" class="lib-state">Cargando plantillas...</div>
        <div v-else-if="templates.length === 0" class="lib-state">
          No hay plantillas guardadas. Crea una en el editor.
        </div>
        <div v-else class="lib-grid">
          <div
            v-for="t in templates"
            :key="t.name"
            class="tpl-card"
            :class="{ picking: picking === t.name }"
            @click="pick(t.name)"
          >
            <div class="tpl-thumb">
              <div class="mock-bar"><span /><span /><span /></div>
              <div class="iframe-wrap">
                <iframe
                  :src="t.path"
                  class="mini-frame"
                  scrolling="no"
                ></iframe>
              </div>
              <div class="tpl-overlay">
                <button class="btn-use">
                  <Check :size="16" />
                  <span>{{
                    picking === t.name ? "Aplicando..." : "Usar esta"
                  }}</span>
                </button>
              </div>
            </div>
            <div class="tpl-info">
              <span class="tpl-name">{{ t.name }}</span>
              <span class="tpl-sub">HTML Email</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lib-window {
  max-width: 1000px;
  width: 95%;
  max-height: 85vh;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.6);
}
.lib-header {
  padding: 24px 32px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.lib-header h2 {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
}
.lib-header p {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 3px;
}
.btn-close {
  background: var(--surface, #13152a);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-close:hover {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

.lib-body {
  flex: 1;
  overflow-y: auto;
}
.lib-state {
  padding: 80px 40px;
  text-align: center;
  color: var(--text-dim);
  font-size: 14px;
}
.lib-grid {
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.tpl-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.tpl-card:hover,
.tpl-card.picking {
  border-color: var(--accent);
  transform: translateY(-4px);
  background: rgba(99, 102, 241, 0.06);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}
.tpl-thumb {
  height: 160px;
  background: #111420;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.mock-bar {
  padding: 6px 10px;
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}
.mock-bar span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-hi, #2d3155);
}
.iframe-wrap {
  flex: 1;
  overflow: hidden;
  background: #fff;
}
.mini-frame {
  width: 1200px;
  height: 900px;
  border: none;
  transform: scale(0.18);
  transform-origin: 0 0;
  pointer-events: none;
}
.tpl-overlay {
  position: absolute;
  inset: 0;
  background: rgba(99, 102, 241, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s;
  backdrop-filter: blur(4px);
}
.tpl-card:hover .tpl-overlay {
  opacity: 1;
}
.btn-use {
  background: #fff;
  color: var(--accent);
  border: none;
  padding: 9px 18px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateY(8px);
  transition: transform 0.3s;
  cursor: pointer;
}
.tpl-card:hover .btn-use {
  transform: translateY(0);
}
.tpl-info {
  padding: 12px 16px;
}
.tpl-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tpl-sub {
  font-size: 10px;
  color: var(--text-dim);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
  display: block;
}

/* ── Responsive ──────────────────────────────────────────── */
@media (max-width: 768px) {
  .lib-window {
    width: 98%;
    border-radius: 20px;
    max-height: 90vh;
  }
  .lib-header {
    padding: 18px 20px;
  }
  .lib-header h2 {
    font-size: 17px;
  }
  .lib-grid {
    padding: 16px;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
  }
  .tpl-thumb {
    height: 130px;
  }
}

@media (max-width: 480px) {
  .lib-window {
    border-radius: 16px;
    max-height: 92vh;
    max-width: 90vw;
  }
  .lib-header {
    padding: 14px 16px;
  }
  .lib-header h2 {
    font-size: 15px;
  }
  .lib-header p {
    font-size: 12px;
  }
  .lib-grid {
    padding: 12px;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .tpl-thumb {
    height: 110px;
  }
  .tpl-info {
    padding: 10px 12px;
  }
  .tpl-name {
    font-size: 12px;
  }
}
</style>
