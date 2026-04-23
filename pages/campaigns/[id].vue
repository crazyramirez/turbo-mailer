<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import {
  ArrowLeft,
  Send,
  Trash2,
  Pencil,
  Mail,
  Eye,
  MousePointerClick,
  XCircle,
  Upload,
  BookOpen,
  ExternalLink,
  Check,
  ChevronDown,
  Loader2,
  AlertCircle,
} from "lucide-vue-next";
import CampaignPreview from "~/components/campaigns/CampaignPreview.vue";
import CampaignLibraryModal from "~/components/campaigns/CampaignLibraryModal.vue";

definePageMeta({ layout: "app" });

const { showToast, showDialog } = useDashboardState();
const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

// ─── State ───────────────────────────────────────────────────
const campaign = ref<any>(null);
const sendsList = ref<any[]>([]);
const lists = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const sending = ref(false);

const editingName = ref(false);
const nameInput = ref("");
const subjectInput = ref("");
const subjectRef = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const showLibrary = ref(false);

const isDraft = computed(() =>
  ["draft", "paused"].includes(campaign.value?.status),
);
const canSend = computed(
  () =>
    isDraft.value &&
    campaign.value?.listId &&
    campaign.value?.templateHtml &&
    subjectInput.value.trim().length > 0,
);

// ─── Fetch ───────────────────────────────────────────────────
async function fetchCampaign() {
  campaign.value = await $fetch<any>(`/api/campaigns/${id}`);
  subjectInput.value = campaign.value.subject;
}
async function fetchSends() {
  sendsList.value = await $fetch<any[]>(`/api/campaigns/${id}/sends`);
}
async function fetchLists() {
  lists.value = await $fetch<any[]>("/api/lists");
}

// ─── Save (debounced) ────────────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout>;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commitSave, 700);
}
async function commitSave() {
  if (!campaign.value) return;
  saving.value = true;
  try {
    await $fetch(`/api/campaigns/${id}`, {
      method: "PUT",
      body: { ...campaign.value, subject: subjectInput.value },
    });
    campaign.value.subject = subjectInput.value;
  } finally {
    saving.value = false;
  }
}

// ─── Name ────────────────────────────────────────────────────
function startEditName() {
  nameInput.value = campaign.value.name;
  editingName.value = true;
  nextTick(() =>
    (document.querySelector(".name-input") as HTMLElement)?.focus(),
  );
}
async function commitName() {
  const v = nameInput.value.trim();
  if (!v || v === campaign.value.name) {
    editingName.value = false;
    return;
  }
  await $fetch(`/api/campaigns/${id}`, {
    method: "PUT",
    body: { ...campaign.value, name: v },
  });
  campaign.value.name = v;
  editingName.value = false;
}

// ─── List ────────────────────────────────────────────────────
async function changeList(e: Event) {
  const val = Number((e.target as HTMLSelectElement).value) || null;
  campaign.value.listId = val;
  await $fetch(`/api/campaigns/${id}`, { method: "PUT", body: campaign.value });
}

// ─── Template ────────────────────────────────────────────────
async function applyTemplate(html: string, name: string) {
  campaign.value.templateHtml = html;
  campaign.value.templateName = name;
  showLibrary.value = false;
  await $fetch(`/api/campaigns/${id}`, { method: "PUT", body: campaign.value });
  showToast(`Plantilla "${name}" aplicada`, "success");
}

function triggerFile() {
  fileInput.value?.click();
}
async function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const html = await file.text();
  const name = file.name.replace(".html", "");
  await applyTemplate(html, name);
  (e.target as HTMLInputElement).value = "";
}

function openEditor() {
  if (campaign.value.templateName) {
    localStorage.setItem("last_edited_template", campaign.value.templateName);
  }
  router.push("/editor");
}

// ─── Subject vars ────────────────────────────────────────────
const VARS = [
  "{{Nombre}}",
  "{{Empresa}}",
  "{{URL}}",
  "{{Linkedin}}",
  "{{Instagram}}",
  "{{Youtube}}",
];
function insertVar(v: string) {
  const el = subjectRef.value;
  if (!el) {
    subjectInput.value += v;
    scheduleSave();
    return;
  }
  const s = el.selectionStart ?? subjectInput.value.length;
  const e2 = el.selectionEnd ?? subjectInput.value.length;
  subjectInput.value =
    subjectInput.value.slice(0, s) + v + subjectInput.value.slice(e2);
  scheduleSave();
  nextTick(() => {
    el.focus();
    const p = s + v.length;
    el.setSelectionRange(p, p);
  });
}

// ─── Send / Delete ───────────────────────────────────────────
async function sendCampaign() {
  const ok = await showDialog({
    type: "confirm",
    title: "Enviar campaña",
    message: `¿Enviar "${campaign.value.name}" a todos los contactos activos de la lista?`,
  });
  if (!ok) return;
  sending.value = true;
  try {
    const res = await $fetch<any>(`/api/campaigns/${id}/send`, {
      method: "POST",
    });
    showToast(
      `Enviados: ${res.sentCount} · Fallidos: ${res.failCount}`,
      "success",
    );
    await Promise.all([fetchCampaign(), fetchSends()]);
  } catch (e: any) {
    showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    sending.value = false;
  }
}

async function deleteCampaign() {
  const ok = await showDialog({
    type: "confirm",
    title: "Eliminar campaña",
    message: campaign.value?.name,
  });
  if (!ok) return;
  await $fetch(`/api/campaigns/${id}`, { method: "DELETE" });
  router.push("/campaigns");
}

// ─── Formatters ──────────────────────────────────────────────
function pct(n: number, total: number) {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}%`;
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(typeof d === "number" ? d * 1000 : d).toLocaleString(
    "es-ES",
    { dateStyle: "short", timeStyle: "short" },
  );
}

const STATUS_BADGE: Record<string, string> = {
  draft: "st-draft",
  sent: "st-sent",
  sending: "st-sending",
  paused: "st-paused",
  scheduled: "st-scheduled",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  sending: "Enviando…",
  paused: "Pausada",
  scheduled: "Programada",
};
const SEND_BADGE: Record<string, string> = {
  sent: "bd-sent",
  failed: "bd-failed",
  pending: "bd-pending",
  opened: "bd-opened",
};
const SEND_LABEL: Record<string, string> = {
  sent: "Enviado",
  failed: "Fallido",
  pending: "Pendiente",
  opened: "Abierto",
};

onMounted(async () => {
  await Promise.all([fetchCampaign(), fetchSends(), fetchLists()]);

  // Auto-sync template content if it was updated in the editor
  if (campaign.value && campaign.value.templateName) {
    try {
      const data = await $fetch<any>('/api/templates', { query: { name: campaign.value.templateName } });
      if (data && data.content && data.content !== campaign.value.templateHtml) {
        campaign.value.templateHtml = data.content;
        await $fetch(`/api/campaigns/${id}`, { method: "PUT", body: campaign.value });
      }
    } catch(e) {
      // Ignorar si la plantilla ya no existe
    }
  }

  loading.value = false;
});
onUnmounted(() => clearTimeout(saveTimer));
</script>

<template>
  <div class="cpage">
    <div v-if="loading" class="cpage-loading">
      <Loader2 :size="28" class="spin" />
    </div>

    <template v-else-if="campaign">
      <!-- ── Header ──────────────────────────────────────── -->
      <div class="cpage-header">
        <div class="hdr-left">
          <button class="btn-back" @click="router.push('/campaigns')">
            <ArrowLeft :size="16" />
          </button>
          <div class="hdr-title-block">
            <div class="hdr-name-row">
              <input
                v-if="editingName"
                v-model="nameInput"
                class="name-input"
                @keyup.enter="commitName"
                @keyup.escape="editingName = false"
                @blur="commitName"
                autofocus
              />
              <h1 v-else class="hdr-name" @dblclick="startEditName">
                {{ campaign.name }}
              </h1>
              <button
                v-if="!editingName"
                class="btn-icon-ghost"
                @click="startEditName"
                title="Renombrar"
              >
                <Pencil :size="20" />
              </button>
              <span v-if="saving" class="saving-dot" title="Guardando…"></span>
            </div>
            <div class="hdr-meta">
              <span class="camp-badge" :class="STATUS_BADGE[campaign.status]">
                {{ STATUS_LABEL[campaign.status] || campaign.status }}
              </span>
              <span v-if="campaign.finishedAt" class="hdr-date"
                >· {{ fmtDate(campaign.finishedAt) }}</span
              >
              <span v-if="campaign.listName" class="hdr-list"
                >· {{ campaign.listName }}</span
              >
            </div>
          </div>
        </div>

        <div class="hdr-actions">
          <div
            v-if="isDraft && subjectInput.trim().length === 0"
            class="hdr-warning"
          >
            <AlertCircle :size="13" /> Escribe un asunto
          </div>
          <div v-if="isDraft && !campaign.listId" class="hdr-warning">
            <AlertCircle :size="13" /> Asigna una lista
          </div>
          <button
            v-if="isDraft"
            class="btn-ghost"
            @click="openEditor"
            title="Editor de plantillas"
          >
            <ExternalLink :size="14" /> Editor
          </button>
          <button
            v-if="canSend"
            class="btn-send"
            :disabled="sending"
            @click="sendCampaign"
          >
            <Loader2 v-if="sending" :size="15" class="spin" />
            <Send v-else :size="15" />
            {{ sending ? "Enviando…" : "Enviar campaña" }}
          </button>
          <button
            class="btn-delete"
            @click="deleteCampaign"
            title="Eliminar campaña"
          >
            <Trash2 :size="15" />
          </button>
        </div>
      </div>

      <!-- ── Body ────────────────────────────────────────── -->
      <div class="cpage-body">
        <!-- Left panel -->
        <div class="left-panel">
          <template v-if="isDraft">
            <!-- Subject -->
            <div class="config-card">
              <div class="cc-label">Asunto del email</div>
              <div class="input-wrap">
                <input
                  ref="subjectRef"
                  v-model="subjectInput"
                  @input="scheduleSave"
                  @blur="commitSave"
                  type="text"
                  class="field-input"
                  placeholder="Escribe el asunto de tu campaña…"
                />
                <button
                  v-if="subjectInput"
                  @click="
                    subjectInput = '';
                    scheduleSave();
                  "
                  class="btn-clear"
                >
                  ×
                </button>
              </div>
              <div class="var-chips">
                <button
                  v-for="v in VARS"
                  :key="v"
                  @click="insertVar(v)"
                  class="var-chip"
                >
                  {{ v.replaceAll("{", "").replaceAll("}", "") }}
                </button>
              </div>
            </div>

            <!-- List -->
            <div class="config-card">
              <div class="cc-label">Lista de destinatarios</div>
              <div class="select-wrap">
                <select
                  class="field-input"
                  :value="campaign.listId ?? ''"
                  @change="changeList"
                >
                  <option value="">Sin lista asignada</option>
                  <option v-for="l in lists" :key="l.id" :value="l.id">
                    {{ l.name }} — {{ l.contactCount }} contactos
                  </option>
                </select>
                <ChevronDown :size="14" class="select-icon" />
              </div>
              <p v-if="!campaign.listId" class="field-hint">
                <AlertCircle :size="12" /> Necesitas una lista para enviar
              </p>
            </div>

            <!-- Template -->
            <div class="config-card">
              <div class="cc-label">Plantilla HTML</div>
              <div class="tpl-btns">
                <button class="tpl-btn" @click="showLibrary = true">
                  <BookOpen :size="15" /> Biblioteca
                </button>
                <button class="tpl-btn" @click="triggerFile">
                  <Upload :size="15" /> Importar HTML
                </button>
              </div>
              <input
                ref="fileInput"
                type="file"
                accept=".html"
                class="sr-only"
                @change="handleFile"
              />
              <div v-if="campaign.templateHtml" class="tpl-status ok">
                <Check :size="13" />
                <span>{{ campaign.templateName || "Plantilla cargada" }}</span>
              </div>
              <div v-else class="tpl-status empty">
                <AlertCircle :size="13" />
                <span>Sin plantilla · elige una de la biblioteca</span>
              </div>
            </div>
          </template>

          <!-- SENT: stats + sends table -->
          <template v-else>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-icon-wrap si-gray"><Mail :size="18" /></div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.sentCount ?? 0 }}</span>
                  <span class="stat-lbl">Enviados</span>
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-icon-wrap si-purple"><Eye :size="18" /></div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.openCount ?? 0 }}</span>
                  <span class="stat-lbl"
                    >Aperturas ·
                    <strong>{{
                      pct(campaign.openCount, campaign.sentCount)
                    }}</strong></span
                  >
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-icon-wrap si-blue">
                  <MousePointerClick :size="18" />
                </div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.clickCount ?? 0 }}</span>
                  <span class="stat-lbl"
                    >Clicks ·
                    <strong>{{
                      pct(campaign.clickCount, campaign.sentCount)
                    }}</strong></span
                  >
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-icon-wrap si-red"><XCircle :size="18" /></div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.failCount ?? 0 }}</span>
                  <span class="stat-lbl">Fallidos</span>
                </div>
              </div>
            </div>
            <div class="section-hdr">Destinatarios</div>
            <div class="table-wrap">
              <div v-if="sendsList.length === 0" class="table-empty">
                Sin registros de envío
              </div>
              <table v-else class="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in sendsList" :key="s.id">
                    <td class="td-email">{{ s.email }}</td>
                    <td class="td-name">{{ s.contactName || "—" }}</td>
                    <td>
                      <span class="send-badge" :class="SEND_BADGE[s.status]">
                        {{ SEND_LABEL[s.status] || s.status }}
                      </span>
                    </td>
                    <td class="td-date">{{ fmtDate(s.sentAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <!-- Right: preview -->
        <div class="right-preview">
          <CampaignPreview
            :html="campaign.templateHtml || ''"
            :subject="subjectInput || campaign.subject"
          />
        </div>
      </div>

      <!-- Library modal -->
      <Transition name="fade-scale">
        <CampaignLibraryModal
          v-if="showLibrary"
          @select="applyTemplate"
          @close="showLibrary = false"
        />
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.cpage {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 100px);
  color: var(--text);
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  overflow-x: hidden;
}
.cpage-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Header */
.cpage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 40px 20px;
  border-bottom: 1px solid var(--border);
  gap: 16px;
}
.hdr-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.btn-back {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}
.btn-back:hover {
  background: rgb(0 0 0 / 8%);
  color: var(--text);
}
.hdr-title-block {
  min-width: 0;
}
.hdr-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hdr-name {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  cursor: default;
}
.name-input {
  font-size: 22px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--accent);
  border-radius: 8px;
  color: #fff;
  padding: 2px 12px;
  outline: none;
  max-width: 360px;
}
.btn-icon-ghost {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px;
  display: flex;
  opacity: 0.8;
  transition: opacity 0.2s;
}
.btn-icon-ghost:hover {
  opacity: 1;
  color: var(--accent-light);
}
.saving-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #facc15;
  animation: pdot 1.2s ease infinite;
}
@keyframes pdot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}
.hdr-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 13px;
  color: var(--text-muted);
}
.camp-badge {
  display: inline-flex;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.st-draft {
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-light);
}
.st-sent {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.st-sending {
  background: rgba(250, 204, 21, 0.12);
  color: #facc15;
}
.st-paused {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}
.st-scheduled {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
}
.hdr-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.btn-send {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-send:hover:not(:disabled) {
  filter: brightness(1.12);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
}
.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-ghost {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 32px;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-ghost:hover {
  background: rgb(0 0 0 / 6%);
  color: var(--text);
}
.btn-delete {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.06);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-delete:hover {
  background: rgba(239, 68, 68, 0.15);
}
.hdr-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #facc15;
  background: rgba(250, 204, 21, 0.08);
  border: 1px solid rgba(250, 204, 21, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: rgb(0 0 0 / 3%);
  border: 1px solid var(--border);
  border-radius: 16px;
}
.stat-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.si-gray {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}
.si-purple {
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-light);
}
.si-blue {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
}
.si-red {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
.stat-num {
  font-size: 26px;
  font-weight: 800;
  display: block;
  line-height: 1;
}
.stat-lbl {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 3px;
  display: block;
}
.stat-lbl strong {
  color: var(--text);
}

/* Body */
.cpage-body {
  flex: 1;
  display: grid;
  grid-template-columns: 40% 1fr;
  gap: 24px;
  padding: 24px 40px 40px;
  align-items: start;
}

/* Left */
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.config-card {
  background: rgb(0 0 0 / 3%);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px 20px;
}
.cc-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.input-wrap {
  position: relative;
}
.field-input {
  width: 100%;
  background: #0d1017;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 14px;
  padding: 10px 36px 10px 12px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  appearance: none;
}
.field-input:focus {
  border-color: var(--accent);
}
select.field-input option {
  background-color: #090b14;
  color: #f8fafc;
}
.btn-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 2px 4px;
}
.btn-clear:hover {
  color: var(--text);
}
.var-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.var-chip {
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: var(--accent-light);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.var-chip:hover {
  background: rgba(99, 102, 241, 0.18);
  border-color: var(--accent);
  transform: translateY(-1px);
}
.select-wrap {
  position: relative;
}
.select-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  pointer-events: none;
}
.field-hint {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.tpl-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.tpl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: rgb(0 0 0 / 8%);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s;
}
.tpl-btn:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--accent-light);
  transform: translateY(-1px);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.tpl-status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  font-size: 12px;
  padding: 7px 10px;
  border-radius: 8px;
}
.tpl-status.ok {
  background: rgba(16, 185, 129, 0.08);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.tpl-status.empty {
  background: rgb(0 0 0 / 5%);
  color: var(--text-dim);
  border: 1px solid var(--border);
}

/* Sends table */
.section-hdr {
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 10px;
}
.table-wrap {
  background: rgb(0 0 0 / 2%);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(100vh - 340px);
}
.table-empty {
  padding: 48px;
  text-align: center;
  color: var(--text-dim);
  font-size: 13px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  padding: 11px 16px;
  text-align: left;
  font-size: 10px;
  font-weight: 800;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: rgb(5 6 14 / 95%);
  backdrop-filter: blur(8px);
}
.data-table td {
  padding: 11px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgb(0 0 0 / 5%);
}
.data-table tr:last-child td {
  border-bottom: none;
}
.data-table tr:hover td {
  background: rgb(0 0 0 / 3%);
}
.td-email {
  font-family: monospace;
  font-size: 12px;
  color: var(--accent-light);
}
.td-name {
  color: var(--text-muted);
}
.td-date {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}
.send-badge {
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.bd-sent {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.bd-failed {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
.bd-pending {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-light);
}
.bd-opened {
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
}

/* Right preview */
.right-preview {
  position: sticky;
  top: 20px;
}

/* Transitions */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}

/* ── Responsive ──────────────────────────────────────────── */

@media (max-width: 1024px) {
  .cpage-header {
    padding: 20px 24px 16px;
  }
  .cpage-body {
    padding: 20px 24px 32px;
    gap: 20px;
  }
}

@media (max-width: 900px) {
  .cpage-body {
    grid-template-columns: 1fr;
    padding: 20px 20px 32px;
  }
  .right-preview {
    position: static;
  }
  .cpage-header {
    padding: 18px 20px 14px;
  }
  .hdr-name {
    font-size: 18px;
  }
  .name-input {
    font-size: 18px;
    max-width: 260px;
  }
}

@media (max-width: 640px) {
  .cpage-header {
    flex-direction: column;
    align-items: flex-start;
    padding: 16px 16px 12px;
    gap: 12px;
  }
  .hdr-left {
    width: 100%;
    gap: 10px;
  }
  .hdr-actions {
    width: 100%;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn-send {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
  .btn-ghost {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
  .hdr-name {
    font-size: 17px;
  }
  .hdr-warning {
    width: 100%;
    font-size: 11px;
  }
  .cpage-body {
    padding: 16px 14px 28px;
    gap: 16px;
  }
  .stats-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .stat-card {
    padding: 14px 16px;
    gap: 10px;
  }
  .stat-num {
    font-size: 22px;
  }
  .stat-icon-wrap {
    width: 36px;
    height: 36px;
  }
  .table-wrap {
    max-height: calc(100vh - 280px);
    border-radius: 12px;
  }
  .data-table th,
  .data-table td {
    padding: 10px 12px;
    font-size: 12px;
  }
  .data-table th:nth-child(3),
  .data-table td:nth-child(3) {
    display: none;
  }
  .tpl-btns {
    grid-template-columns: 1fr;
  }
  .config-card {
    padding: 14px 16px;
    border-radius: 12px;
  }
}

@media (max-width: 480px) {
  .cpage-header {
    padding: 14px 12px 10px;
  }
  .cpage-body {
    padding: 12px 12px 24px;
  }
  .hdr-name {
    font-size: 16px;
  }
  .btn-delete {
    width: 44px;
    height: 44px;
  }
  .stats-grid {
    gap: 8px;
  }
  .stat-card {
    padding: 12px 14px;
  }
  .stat-num {
    font-size: 20px;
  }
}
</style>
