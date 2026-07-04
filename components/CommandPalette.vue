<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import {
  Search, LayoutDashboard, Megaphone, Users, PenSquare, BarChart3,
  ScrollText, Plus, CornerDownLeft,
} from "lucide-vue-next";
const { t } = useI18n();
const router = useRouter();

const open = ref(false);
const query = ref("");
const selected = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

interface Cmd {
  id: string;
  icon: any;
  labelKey: string;
  action: () => void;
  keywords: string;
}

const commands: Cmd[] = [
  { id: "dashboard", icon: LayoutDashboard, labelKey: "palette.go_dashboard", keywords: "dashboard inicio home panel", action: () => router.push("/dashboard") },
  { id: "campaigns", icon: Megaphone, labelKey: "palette.go_campaigns", keywords: "campaigns campañas email envios", action: () => router.push("/campaigns") },
  { id: "new_campaign", icon: Plus, labelKey: "palette.new_campaign", keywords: "new nueva campaña campaign crear create", action: () => router.push("/campaigns/new") },
  { id: "contacts", icon: Users, labelKey: "palette.go_contacts", keywords: "contacts contactos listas lists crm", action: () => router.push("/contacts") },
  { id: "editor", icon: PenSquare, labelKey: "palette.go_editor", keywords: "editor plantilla template html diseño design", action: () => router.push("/editor") },
  { id: "analytics", icon: BarChart3, labelKey: "palette.go_analytics", keywords: "analytics analiticas estadisticas stats metrics", action: () => router.push("/analytics") },
  { id: "audit", icon: ScrollText, labelKey: "palette.go_audit", keywords: "audit auditoria log registro actividad", action: () => router.push("/audit") },
];

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter(
    (c) => t(c.labelKey).toLowerCase().includes(q) || c.keywords.includes(q),
  );
});

watch(filtered, () => { selected.value = 0; });

function toggle() {
  open.value = !open.value;
  if (open.value) {
    query.value = "";
    selected.value = 0;
    nextTick(() => inputRef.value?.focus());
  }
}

function run(cmd: Cmd) {
  open.value = false;
  cmd.action();
}

function onGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    toggle();
    return;
  }
  if (!open.value) return;
  if (e.key === "Escape") { open.value = false; return; }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selected.value = Math.min(selected.value + 1, filtered.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selected.value = Math.max(selected.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cmd = filtered.value[selected.value];
    if (cmd) run(cmd);
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKey));
onUnmounted(() => window.removeEventListener("keydown", onGlobalKey));
</script>

<template>
  <Teleport to="body">
    <Transition name="cp-fade">
      <div v-if="open" class="cp-overlay" @click.self="open = false">
        <div class="cp-box" role="dialog" aria-modal="true" :aria-label="t('palette.title')">
          <div class="cp-input-row">
            <Search :size="16" class="cp-search-ico" />
            <input
              ref="inputRef"
              v-model="query"
              class="cp-input"
              :placeholder="t('palette.placeholder')"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="cp-kbd">Esc</kbd>
          </div>
          <ul class="cp-list" role="listbox">
            <li v-if="filtered.length === 0" class="cp-empty">
              {{ t("palette.no_results") }}
            </li>
            <li
              v-for="(cmd, i) in filtered"
              :key="cmd.id"
              class="cp-item"
              :class="{ active: i === selected }"
              role="option"
              :aria-selected="i === selected"
              @click="run(cmd)"
              @mousemove="selected = i"
            >
              <component :is="cmd.icon" :size="15" class="cp-item-ico" />
              <span>{{ t(cmd.labelKey) }}</span>
              <CornerDownLeft v-if="i === selected" :size="13" class="cp-enter" />
            </li>
          </ul>
          <div class="cp-footer">
            <span><kbd class="cp-kbd">↑↓</kbd> {{ t("palette.navigate") }}</span>
            <span><kbd class="cp-kbd">↵</kbd> {{ t("palette.open") }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(3, 5, 12, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
}
.cp-box {
  width: min(560px, 92vw);
  background: #0b0e1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.cp-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.cp-search-ico { color: #8b8fa3; flex-shrink: 0; }
.cp-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #e5e7f0;
  font-size: 0.95rem;
}
.cp-input::placeholder { color: #565b70; }
.cp-kbd {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 0.65rem;
  color: #8b8fa3;
  font-family: inherit;
}
.cp-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 320px;
  overflow-y: auto;
}
.cp-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #c9cbe0;
  font-size: 0.85rem;
  cursor: pointer;
}
.cp-item.active {
  background: rgba(99, 102, 241, 0.16);
  color: #fff;
}
.cp-item-ico { color: #8b8fa3; flex-shrink: 0; }
.cp-item.active .cp-item-ico { color: #a5a8ff; }
.cp-enter { margin-left: auto; color: #6366f1; }
.cp-empty {
  padding: 18px 12px;
  text-align: center;
  color: #565b70;
  font-size: 0.82rem;
}
.cp-footer {
  display: flex;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  color: #565b70;
  font-size: 0.7rem;
}
.cp-footer span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cp-fade-enter-active, .cp-fade-leave-active { transition: opacity 0.13s ease; }
.cp-fade-enter-from, .cp-fade-leave-to { opacity: 0; }
</style>
