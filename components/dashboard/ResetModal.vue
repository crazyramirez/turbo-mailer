<script setup lang="ts">
import {
  Trash2,
  Database,
  Users,
  Mail,
  BarChart2,
  AlertTriangle,
  X,
  ShieldCheck,
  FolderOpen,
} from "lucide-vue-next";

const emit = defineEmits<{ close: []; done: [] }>();
const { t } = useI18n();
const { showToast } = useDashboardState();

interface Scope {
  id: string;
  icon: any;
  label: string;
  desc: string;
  danger: "high" | "medium" | "low";
}

const scopes: Scope[] = [
  {
    id: "all",
    icon: Trash2,
    label: t("reset_modal.scope_all_label"),
    desc: t("reset_modal.scope_all_desc"),
    danger: "high",
  },
  {
    id: "db",
    icon: Database,
    label: t("reset_modal.scope_db_label"),
    desc: t("reset_modal.scope_db_desc"),
    danger: "high",
  },
  {
    id: "contacts",
    icon: Users,
    label: t("reset_modal.scope_contacts_label"),
    desc: t("reset_modal.scope_contacts_desc"),
    danger: "medium",
  },
  {
    id: "campaigns",
    icon: Mail,
    label: t("reset_modal.scope_campaigns_label"),
    desc: t("reset_modal.scope_campaigns_desc"),
    danger: "medium",
  },
  {
    id: "analytics",
    icon: BarChart2,
    label: t("reset_modal.scope_analytics_label"),
    desc: t("reset_modal.scope_analytics_desc"),
    danger: "low",
  },
];

const selectedScope = ref<string | null>(null);
const confirmInput = ref("");
const loading = ref(false);
const backupPath = ref<string | null>(null);

const canDelete = computed(
  () =>
    selectedScope.value !== null &&
    confirmInput.value.trim().toUpperCase() === "OK",
);

function selectScope(id: string) {
  selectedScope.value = selectedScope.value === id ? null : id;
  confirmInput.value = "";
}

function dangerClass(d: "high" | "medium" | "low") {
  if (d === "high") return "danger-high";
  if (d === "medium") return "danger-medium";
  return "danger-low";
}

const needsReload = computed(
  () => selectedScope.value === "all" || selectedScope.value === "db",
);

async function performReset() {
  if (!canDelete.value || !selectedScope.value) return;
  loading.value = true;
  try {
    const res = await $fetch<{ ok: boolean; backupPath: string | null }>(
      "/api/reset",
      { method: "DELETE", body: { scope: selectedScope.value } },
    );
    if (needsReload.value) {
      localStorage.removeItem("turbomailer_welcome_seen");
      backupPath.value = res.backupPath;
      emit("done");
      // don't close yet — show backup confirmation first
    } else {
      showToast(t("reset_modal.success"), "success");
      emit("done");
      emit("close");
    }
  } catch {
    showToast(t("reset_modal.error"), "error");
  } finally {
    loading.value = false;
  }
}

function acceptAndReload() {
  emit("close");
  window.location.reload();
}

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains("rm-overlay")) emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="rm-fade">
      <div class="rm-overlay" @click="onOverlayClick">
        <div class="rm-window" role="dialog" aria-modal="true">

          <!-- ── Backup confirmation (post-reset) ──────────────── -->
          <Transition name="rm-confirm-slide">
            <div v-if="backupPath" class="rm-backup-done">
              <div class="rm-backup-icon">
                <ShieldCheck :size="22" />
              </div>
              <div class="rm-backup-body">
                <span class="rm-backup-title">{{ t("reset_modal.backup_title") }}</span>
                <span class="rm-backup-desc">{{ t("reset_modal.backup_desc") }}</span>
                <div class="rm-backup-path">
                  <FolderOpen :size="12" />
                  <code>{{ backupPath }}</code>
                </div>
              </div>
              <button class="rm-btn-accept" @click="acceptAndReload">
                {{ t("reset_modal.backup_accept") }}
              </button>
            </div>
          </Transition>

          <!-- Header -->
          <div v-if="!backupPath" class="rm-header">
            <div class="rm-header-icon">
              <AlertTriangle :size="20" />
            </div>
            <div class="rm-header-text">
              <h2>{{ t("reset_modal.title") }}</h2>
              <p>{{ t("reset_modal.subtitle") }}</p>
            </div>
            <button class="rm-close" @click="emit('close')">
              <X :size="16" />
            </button>
          </div>

          <!-- Scope grid -->
          <div v-if="!backupPath" class="rm-scopes">
            <button
              v-for="s in scopes"
              :key="s.id"
              class="rm-scope-card"
              :class="[
                dangerClass(s.danger),
                { selected: selectedScope === s.id },
              ]"
              @click="selectScope(s.id)"
            >
              <div class="rm-scope-icon">
                <component :is="s.icon" :size="18" />
              </div>
              <div class="rm-scope-body">
                <span class="rm-scope-label">{{ s.label }}</span>
                <span class="rm-scope-desc">{{ s.desc }}</span>
              </div>
            </button>
          </div>

          <!-- Confirm input -->
          <Transition name="rm-confirm-slide">
            <div v-if="selectedScope && !backupPath" class="rm-confirm-area">
              <label class="rm-confirm-label">
                <AlertTriangle :size="13" />
                <span
                  v-html="
                    t('reset_modal.confirm_text', { ok: '<strong>OK</strong>' })
                  "
                ></span>
              </label>
              <input
                v-model="confirmInput"
                class="rm-confirm-input"
                :placeholder="
                  t('reset_modal.confirm_placeholder', { ok: 'OK' })
                "
                autocomplete="off"
                spellcheck="false"
                @keydown.enter="performReset"
              />
            </div>
          </Transition>

          <!-- Actions -->
          <div v-if="!backupPath" class="rm-actions">
            <button class="rm-btn-cancel" @click="emit('close')">
              {{ t("reset_modal.cancel") }}
            </button>
            <button
              class="rm-btn-delete"
              :disabled="!canDelete || loading"
              @click="performReset"
            >
              <Trash2 :size="14" />
              {{
                loading ? t("reset_modal.deleting") : t("reset_modal.delete")
              }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.rm-window {
  background: #1d242f;
  border: 1px solid var(--border);
  border-radius: 20px;
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  padding: 10px;
}

/* ── Header ──────────────────────────────────────────── */
.rm-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 22px 18px;
  border-bottom: 1px solid var(--border);
}

.rm-header-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rm-header-text {
  flex: 1;
}

.rm-header-text h2 {
  font-size: 16px;
  font-weight: 800;
  margin: 0 0 3px;
  color: var(--text);
}

.rm-header-text p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.rm-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.rm-close:hover {
  background: rgb(255 255 255 / 5%);
  color: var(--text);
}

/* ── Scope cards ─────────────────────────────────────── */
.rm-scopes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 22px;
}

.rm-scope-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 16px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s,
    background 0.15s;
  width: 100%;
}

.rm-scope-card:hover:not(.selected) {
  background: rgb(255 255 255 / 3%);
}

.rm-scope-card.selected.danger-high {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.07);
}

.rm-scope-card.selected.danger-medium {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.07);
}

.rm-scope-card.selected.danger-low {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.07);
}

.rm-scope-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.danger-high .rm-scope-icon {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.danger-medium .rm-scope-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.danger-low .rm-scope-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.rm-scope-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rm-scope-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.rm-scope-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ── Confirm area ────────────────────────────────────── */
.rm-confirm-area {
  padding: 0 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rm-confirm-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.rm-confirm-label strong {
  color: #ef4444;
  font-weight: 800;
}

.rm-confirm-input {
  width: 100%;
  padding: 10px 14px;
  background: rgb(0 0 0 / 20%);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
  outline: none;
  transition: border-color 0.15s;
  letter-spacing: 0.05em;
  box-sizing: border-box;
}

.rm-confirm-input:focus {
  border-color: rgba(239, 68, 68, 0.5);
}

/* ── Actions ─────────────────────────────────────────── */
.rm-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid var(--border);
}

.rm-btn-cancel {
  padding: 9px 18px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.rm-btn-cancel:hover {
  background: rgb(255 255 255 / 5%);
  color: var(--text);
}

.rm-btn-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-radius: 10px;
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.rm-btn-delete:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.rm-btn-delete:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}

/* ── Transitions ─────────────────────────────────────── */
.rm-fade-enter-active,
.rm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.rm-fade-enter-from,
.rm-fade-leave-to {
  opacity: 0;
}

.rm-fade-enter-active .rm-window,
.rm-fade-leave-active .rm-window {
  transition: transform 0.2s ease;
}

.rm-fade-enter-from .rm-window,
.rm-fade-leave-to .rm-window {
  transform: scale(0.96) translateY(8px);
}

.rm-confirm-slide-enter-active,
.rm-confirm-slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.rm-confirm-slide-enter-from,
.rm-confirm-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-bottom: 0;
}

.rm-confirm-slide-enter-to,
.rm-confirm-slide-leave-from {
  opacity: 1;
  max-height: 120px;
}

/* ── Backup confirmation panel ───────────────────────── */
.rm-backup-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 28px 28px;
  text-align: center;
}

.rm-backup-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.12);
}

.rm-backup-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.rm-backup-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--text);
}

.rm-backup-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}

.rm-backup-path {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  padding: 10px 14px;
  background: rgb(0 0 0 / 20%);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: #10b981;
  text-align: left;
  overflow: hidden;
}

.rm-backup-path svg {
  flex-shrink: 0;
}

.rm-backup-path code {
  font-size: 11px;
  font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: break-all;
}

.rm-btn-accept {
  width: 100%;
  padding: 11px 20px;
  border-radius: 10px;
  border: none;
  background: #10b981;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.15s, transform 0.15s;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}

.rm-btn-accept:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
</style>
