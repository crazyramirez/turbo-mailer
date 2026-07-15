<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from "vue";
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
  RotateCcw,
  Clock,
  Calendar,
  FlaskConical,
} from "lucide-vue-next";
import CampaignPreview from "~/components/campaigns/CampaignPreview.vue";
import CampaignLibraryModal from "~/components/campaigns/CampaignLibraryModal.vue";
import PreSendChecklist from "~/components/campaigns/PreSendChecklist.vue";
import TestSendModal from "~/components/campaigns/TestSendModal.vue";

definePageMeta({ layout: "app" });

const { showToast, showDialog } = useDashboardState();
const { startMonitoring } = useSendingMonitor();
const resendingSingle = ref<number | null>(null);
const checkingBounces = ref(false);
const bounceLog = ref<string[]>([]);
const showBounceLog = ref(false);
const { t } = useI18n();
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
const dismissOverlay = ref(false);
const showEmailConfig = ref(false);

const isScheduledMode = ref(false);
const scheduleInput = ref("");
const dateInputRef = ref<HTMLInputElement | null>(null);
const countdownText = ref("");
let countdownInterval: ReturnType<typeof setInterval> | null = null;

const isDraft = computed(() => campaign.value?.status === "draft");
const isScheduled = computed(() => campaign.value?.status === "scheduled");

const isScheduleInputValid = computed(() => {
  if (!scheduleInput.value) return false;
  return new Date(scheduleInput.value) > new Date();
});

const minDateTime = computed(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
});

const pendingCount = computed(
  () => sendsList.value.filter((s) => s.status === "pending").length,
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
  
  if (campaign.value.scheduledAt) {
    const d = new Date(campaign.value.scheduledAt);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    scheduleInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  } else {
    scheduleInput.value = "";
  }
  
  if (campaign.value?.status === "scheduled") {
    startCountdown();
  } else {
    stopCountdown();
  }
}
async function fetchSends() {
  sendsList.value = await $fetch<any[]>(`/api/campaigns/${id}/sends`);
}
async function fetchLists() {
  lists.value = await $fetch<any[]>("/api/lists");
}

// ─── Scheduled Actions ───────────────────────────────────────
function startCountdown() {
  stopCountdown();
  countdownInterval = setInterval(() => {
    if (campaign.value?.status !== "scheduled" || !campaign.value.scheduledAt) {
      stopCountdown();
      return;
    }
    const target = new Date(campaign.value.scheduledAt).getTime();
    const now = new Date().getTime();
    const diff = target - now;
    if (diff <= 0) {
      countdownText.value = "Enviando ahora...";
      stopCountdown();
      fetchCampaign();
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    countdownText.value = `Se enviará en ${parts.join(" ")}`;
  }, 1000);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

async function scheduleCampaign() {
  if (!scheduleInput.value) return;
  saving.value = true;
  try {
    const payload = {
      ...campaign.value,
      status: "scheduled",
      scheduledAt: new Date(scheduleInput.value).toISOString(),
    };
    await $fetch(`/api/campaigns/${id}`, {
      method: "PUT",
      body: payload,
    });
    isScheduledMode.value = false;
    showToast("Campaña programada correctamente", "success");
    await fetchCampaign();
  } catch (err: any) {
    showToast(`Error al programar: ${err.message}`, "error");
  } finally {
    saving.value = false;
  }
}

async function unscheduleCampaign() {
  saving.value = true;
  try {
    const payload = {
      ...campaign.value,
      status: "draft",
      scheduledAt: null,
    };
    await $fetch(`/api/campaigns/${id}`, {
      method: "PUT",
      body: payload,
    });
    isScheduledMode.value = false;
    showToast("Campaña devuelta a borrador", "info");
    await fetchCampaign();
  } catch (err: any) {
    showToast(`Error al desprogramar: ${err.message}`, "error");
  } finally {
    saving.value = false;
  }
}

async function sendScheduledNow() {
  const ok = await showDialog({
    type: "confirm",
    title: "Enviar ahora",
    message: "¿Estás seguro de que quieres enviar la campaña programada inmediatamente?",
  });
  if (!ok) return;
  
  saving.value = true;
  try {
    const payload = {
      ...campaign.value,
      status: "draft",
      scheduledAt: null,
    };
    await $fetch(`/api/campaigns/${id}`, {
      method: "PUT",
      body: payload,
    });
    await fetchCampaign();
    await sendCampaign();
  } catch (err: any) {
    showToast(`Error al enviar: ${err.message}`, "error");
  } finally {
    saving.value = false;
  }
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
  campaign.value.tagFilter = [];
  await $fetch(`/api/campaigns/${id}`, { method: "PUT", body: campaign.value });
  await fetchListTags();
}

// ─── Segmentation (tag filter) ───────────────────────────────
const availableTags = ref<{ tag: string; count: number }[]>([]);

async function fetchListTags() {
  if (!campaign.value?.listId) {
    availableTags.value = [];
    return;
  }
  try {
    availableTags.value = await $fetch<{ tag: string; count: number }[]>(
      `/api/lists/${campaign.value.listId}/tags`,
    );
  } catch {
    availableTags.value = [];
  }
}

function tagSelected(tag: string): boolean {
  const f = campaign.value?.tagFilter;
  return Array.isArray(f) && f.some((t: string) => t.toLowerCase() === tag.toLowerCase());
}

async function toggleTag(tag: string) {
  const current: string[] = Array.isArray(campaign.value.tagFilter)
    ? [...campaign.value.tagFilter]
    : [];
  const idx = current.findIndex((t) => t.toLowerCase() === tag.toLowerCase());
  if (idx >= 0) current.splice(idx, 1);
  else current.push(tag);
  campaign.value.tagFilter = current;
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
const displayVars = computed(() => [
  `{{${t("variables.name")}}}`,
  `{{${t("variables.company")}}}`,
  `{{${t("variables.role")}}}`,
  `{{${t("variables.city")}}}`,
  `{{${t("variables.country")}}}`,
  `{{${t("variables.service")}}}`,
  "{{URL}}",
  "{{Linkedin}}",
  "{{Instagram}}",
  "{{Youtube}}",
]);
function insertVar(v: string) {
  const el = subjectRef.value;
  if (!el) {
    let toInsert = v + " ";
    if (subjectInput.value.length > 0 && !subjectInput.value.endsWith(" ")) {
      toInsert = " " + toInsert;
    }
    subjectInput.value += toInsert;
    scheduleSave();
    return;
  }
  const s = el.selectionStart ?? subjectInput.value.length;
  const e2 = el.selectionEnd ?? subjectInput.value.length;

  let prefix = "";
  if (s > 0 && subjectInput.value[s - 1] !== " ") {
    prefix = " ";
  }

  const toInsert = prefix + v + " ";
  subjectInput.value =
    subjectInput.value.slice(0, s) + toInsert + subjectInput.value.slice(e2);

  scheduleSave();
  nextTick(() => {
    el.focus();
    const p = s + toInsert.length;
    el.setSelectionRange(p, p);
  });
}

// ─── Send / Delete ───────────────────────────────────────────
const showPrecheck = ref(false);
const showTestModal = ref(false);

const canTest = computed(
  () => !!campaign.value?.templateHtml && campaign.value?.status !== "sending",
);

// Opens the pre-send checklist; the actual send happens on confirm
function sendCampaign() {
  showPrecheck.value = true;
}

async function doSendCampaign() {
  showPrecheck.value = false;
  sending.value = true;
  try {
    await $fetch<any>(`/api/campaigns/${id}/send`, {
      method: "POST",
    });
    showToast("Enviando campaña...", "info");
    await Promise.all([fetchCampaign(), fetchSends()]);
    if (campaign.value?.status === "sending") {
      startMonitoring(id);
      dismissOverlay.value = false;
      setTimeout(() => {
        dismissOverlay.value = true;
      }, 4000);
      startPolling();
    }
  } catch (e: any) {
    showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    sending.value = false;
  }
}

async function retryCampaign() {
  const ok = await showDialog({
    type: "confirm",
    title: "Reintentar fallidos",
    message: `¿Intentar enviar de nuevo los ${campaign.value.failCount} emails que fallaron?`,
  });
  if (!ok) return;
  sending.value = true;
  try {
    await $fetch<any>(`/api/campaigns/${id}/retry`, {
      method: "POST",
    });
    showToast("Reintentando envíos fallidos...", "info");
    await Promise.all([fetchCampaign(), fetchSends()]);
    if (campaign.value?.status === "sending") {
      startMonitoring(id);
      dismissOverlay.value = false;
      setTimeout(() => {
        dismissOverlay.value = true;
      }, 4000);
      startPolling();
    }
  } catch (e: any) {
    showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    sending.value = false;
  }
}

// ─── A/B subject test ────────────────────────────────────────
const abPhaseLabel = computed(() => {
  switch (campaign.value?.abPhase) {
    case "sample":
      return "Enviando muestra";
    case "waiting":
      return "Esperando ganador";
    case "final":
      return `Ganador: ${campaign.value?.abWinner ?? "?"}`;
    default:
      return "";
  }
});

const abStats = computed(() => {
  const stats = {
    A: { sent: 0, opens: 0 },
    B: { sent: 0, opens: 0 },
    held: 0,
  };
  for (const s of sendsList.value) {
    if (s.status === "held") stats.held++;
    if (s.variant !== "A" && s.variant !== "B") continue;
    const v = stats[s.variant as "A" | "B"];
    if (s.status === "sent" || s.status === "opened") v.sent++;
    if (s.status === "opened") v.opens++;
  }
  return stats;
});

// ─── Manual status override ──────────────────────────────────
// "scheduled" no es forzable a mano: programar requiere fecha y tiene su
// propio flujo (botón de programación) — forzarlo equivaldría a borrador
const SETTABLE_STATUSES = ["draft", "paused", "sent"] as const;
const statusMenuOpen = ref(false);
const changingStatus = ref(false);

const STATUS_CHANGE_WARNING: Record<string, string> = {
  draft:
    "La campaña volverá a ser editable y podrá enviarse de nuevo (los registros de envío actuales se conservan hasta el próximo envío).",
  sent: "La campaña se marcará como enviada sin pasar por el pipeline de envío.",
  paused: "La campaña quedará pausada.",
};

async function setStatus(target: string) {
  statusMenuOpen.value = false;
  const ok = await showDialog({
    type: "confirm",
    title: `Cambiar a «${STATUS_LABEL[target]}»`,
    message: STATUS_CHANGE_WARNING[target],
  });
  if (!ok) return;
  changingStatus.value = true;
  try {
    await $fetch<any>(`/api/campaigns/${id}/status`, {
      method: "POST",
      body: { status: target },
    });
    showToast(`Estado cambiado a ${STATUS_LABEL[target]}`, "success");
    await Promise.all([fetchCampaign(), fetchSends()]);
  } catch (e: any) {
    showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    changingStatus.value = false;
  }
}

function closeStatusMenu() {
  statusMenuOpen.value = false;
}

// ─── Link click stats ────────────────────────────────────────
const linkStats = ref<
  { url: string; clicks: number; uniqueClickers: number }[]
>([]);

async function fetchLinkStats() {
  if (!campaign.value || campaign.value.status === "draft") return;
  try {
    const res = await $fetch<any>(`/api/campaigns/${id}/analytics`);
    linkStats.value = res.linkStats ?? [];
  } catch {
    linkStats.value = [];
  }
}

const maxLinkClicks = computed(() =>
  Math.max(...linkStats.value.map((l) => l.clicks), 1),
);

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return u.hostname + (path.length > 32 ? path.slice(0, 32) + "…" : path);
  } catch {
    return url.length > 48 ? url.slice(0, 48) + "…" : url;
  }
}

// ─── Auto follow-up ──────────────────────────────────────────
const followUpEta = computed(() => {
  const c = campaign.value;
  if (!c?.finishedAt) return "";
  const eta = new Date(
    new Date(c.finishedAt).getTime() +
      (Number(c.followUpDelayHours) || 48) * 3600_000,
  );
  return eta.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
});

// ─── Preview as real contact ─────────────────────────────────
const previewContactId = ref<number | null>(null);
const previewContacts = ref<any[]>([]);
const personalizedPreview = ref<{ html: string; subject: string } | null>(null);
const loadingPreview = ref(false);

async function fetchPreviewContacts() {
  if (!campaign.value?.listId) {
    previewContacts.value = [];
    return;
  }
  try {
    const res = await $fetch<any>(
      `/api/contacts?list_id=${campaign.value.listId}`,
    );
    previewContacts.value = (res.data || []).slice(0, 25);
  } catch {
    previewContacts.value = [];
  }
}

watch(previewContactId, async (contactId) => {
  if (!contactId) {
    personalizedPreview.value = null;
    return;
  }
  loadingPreview.value = true;
  try {
    personalizedPreview.value = await $fetch<any>(
      `/api/campaigns/${id}/preview?contactId=${contactId}`,
    );
  } catch {
    personalizedPreview.value = null;
    showToast("No se pudo generar la vista previa personalizada", "error");
  } finally {
    loadingPreview.value = false;
  }
});

// Template edits invalidate the personalized render — re-fetch on change
watch(
  () => campaign.value?.templateHtml,
  () => {
    if (previewContactId.value) {
      const current = previewContactId.value;
      previewContactId.value = null;
      nextTick(() => (previewContactId.value = current));
    }
  },
);

// ─── Follow-up: re-send to non-openers ───────────────────────
const creatingFollowUp = ref(false);
const unopenedCount = computed(
  () => sendsList.value.filter((s) => s.status === "sent").length,
);
async function createFollowUp() {
  const ok = await showDialog({
    type: "confirm",
    title: "Reenviar a no abiertos",
    message: `Se creará un borrador de seguimiento dirigido a los ${unopenedCount.value} contactos que recibieron el email pero no lo abrieron. Podrás cambiar el asunto antes de enviar.`,
  });
  if (!ok) return;
  creatingFollowUp.value = true;
  try {
    const res = await $fetch<any>(`/api/campaigns/${id}/resend-unopened`, {
      method: "POST",
      body: {},
    });
    showToast("Borrador de seguimiento creado", "success");
    router.push(`/campaigns/${res.campaign.id}`);
  } catch (e: any) {
    showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    creatingFollowUp.value = false;
  }
}

// ─── Resume / Resend ─────────────────────────────────────────
async function resumeFromPage() {
  sending.value = true;
  try {
    await $fetch<any>(`/api/campaigns/${id}/send`, { method: "POST" });
    startMonitoring(id);
    await fetchCampaign();
    startPolling();
  } catch (e: any) {
    showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    sending.value = false;
  }
}

async function resendSingle(sendId: number) {
  resendingSingle.value = sendId;
  try {
    await $fetch<any>(`/api/campaigns/${id}/sends/${sendId}/resend`, {
      method: "POST",
    });
    startMonitoring(id);
    await fetchCampaign();
    startPolling();
  } catch (e: any) {
    showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    resendingSingle.value = null;
  }
}

// ─── Bounce check ────────────────────────────────────────────
async function checkBounces(silent = false) {
  if (checkingBounces.value) return;
  checkingBounces.value = true;
  try {
    const r = await $fetch<{
      checked: number;
      bounced: number;
      errors: string[];
    }>("/api/bounces/process", { method: "POST" });
    // Always refresh log after any check
    await refreshBounceLog();
    if (r.errors?.length) {
      showToast(`Error IMAP: ${r.errors[0]}`, "error");
      showBounceLog.value = true;
      return;
    }
    if (r.bounced > 0) {
      showToast(`${r.bounced} rebote(s) detectado(s)`, "info");
      await Promise.all([fetchCampaign(), fetchSends()]);
    } else if (!silent) {
      showToast(`${r.checked} emails revisados — sin rebotes`, "success");
    }
  } catch (e: any) {
    if (!silent)
      showToast(`Error: ${e.data?.statusMessage || e.message}`, "error");
  } finally {
    checkingBounces.value = false;
  }
}

async function refreshBounceLog() {
  try {
    const r = await $fetch<{ lines: string[] }>("/api/bounces/log");
    bounceLog.value = r.lines;
  } catch {}
}

// ─── Polling ─────────────────────────────────────────────────
let pollTimer: ReturnType<typeof setInterval> | null = null;
let finishedPollingAt: number | null = null;

function startPolling() {
  if (pollTimer) return;
  finishedPollingAt = null;
  pollTimer = setInterval(async () => {
    // Actualizamos tanto la campaña (stats) como la lista de envíos en paralelo
    await Promise.all([fetchCampaign(), fetchSends()]);

    if (campaign.value?.status !== "sending") {
      if (!finishedPollingAt) {
        finishedPollingAt = Date.now();
      }
      // Seguimos pulleando 45 segundos extra después de terminar para captar los rebotes automáticos (delay de 15s)
      if (Date.now() - finishedPollingAt > 45000) {
        stopPolling();
      }
    } else {
      finishedPollingAt = null;
    }
  }, 1000); // Poll every 1s instead of 3s for real-time precision
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    finishedPollingAt = null;
  }
}

async function deleteCampaign() {
  const ok = await showDialog({
    type: "confirm",
    title: "Eliminar campaña",
    message: campaign.value?.name,
  });
  if (!ok) return;
  try {
    await $fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    showToast("Campaña eliminada", "success");
    router.push("/campaigns");
  } catch (e: any) {
    showToast("Error al eliminar la campaña", "error");
  }
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
  bounced: "bd-bounced",
  held: "bd-pending",
};
const SEND_LABEL: Record<string, string> = {
  sent: "Enviado",
  failed: "Fallido",
  pending: "Pendiente",
  opened: "Abierto",
  bounced: "Rebotado",
  held: "En espera (A/B)",
};

onMounted(async () => {
  document.addEventListener("click", closeStatusMenu);
  await Promise.all([fetchCampaign(), fetchSends(), fetchLists()]);
  fetchPreviewContacts();
  fetchLinkStats();

  // Auto-sync template content if it was updated in the editor (only for non-sent campaigns)
  if (
    campaign.value &&
    campaign.value.templateName &&
    campaign.value.status !== "sent"
  ) {
    try {
      const data = await $fetch<any>("/api/templates", {
        query: { name: campaign.value.templateName },
      });
      if (
        data &&
        data.content &&
        data.content !== campaign.value.templateHtml
      ) {
        campaign.value.templateHtml = data.content;
        await $fetch(`/api/campaigns/${id}`, {
          method: "PUT",
          body: campaign.value,
        });
      }
    } catch (e) {
      // Ignorar si la plantilla ya no existe
    }
  }

  loading.value = false;
  fetchListTags();

  if (campaign.value?.status === "sending") {
    dismissOverlay.value = true;
    startMonitoring(id);
    startPolling();
  }

  // Auto-check bounces silently when opening a sent campaign
  if (campaign.value?.status === "sent") {
    checkBounces(true);
  }
});
onUnmounted(() => {
  document.removeEventListener("click", closeStatusMenu);
  clearTimeout(saveTimer);
  stopPolling();
  stopCountdown();
});
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
              <div class="status-switch" @click.stop>
                <button
                  class="camp-badge status-switch-btn"
                  :class="STATUS_BADGE[campaign.status]"
                  :disabled="campaign.status === 'sending' || changingStatus"
                  title="Cambiar estado manualmente"
                  @click="statusMenuOpen = !statusMenuOpen"
                >
                  <Loader2 v-if="changingStatus" :size="10" class="spin" />
                  {{ STATUS_LABEL[campaign.status] || campaign.status }}
                  <ChevronDown
                    v-if="campaign.status !== 'sending'"
                    :size="10"
                    class="status-chevron"
                  />
                </button>
                <div v-if="statusMenuOpen" class="status-menu">
                  <button
                    v-for="s in SETTABLE_STATUSES"
                    :key="s"
                    class="status-menu-item"
                    :class="{ current: campaign.status === s }"
                    :disabled="campaign.status === s"
                    @click="setStatus(s)"
                  >
                    <span class="status-dot" :class="STATUS_BADGE[s]"></span>
                    {{ STATUS_LABEL[s] }}
                  </button>
                </div>
              </div>
              <span v-if="campaign.finishedAt" class="hdr-date">{{
                fmtDate(campaign.finishedAt)
              }}</span>
              <span v-if="campaign.listName" class="hdr-list">{{
                campaign.listName
              }}</span>
            </div>
          </div>
        </div>

        <div class="hdr-actions">
          <div
            v-if="isDraft && subjectInput.trim().length === 0"
            class="hdr-warning"
            title="Escribe un asunto"
          >
            <AlertCircle :size="13" /> <span>Escribe un asunto</span>
          </div>
          <div
            v-if="isDraft && !campaign.listId"
            class="hdr-warning"
            title="Asigna una lista"
          >
            <AlertCircle :size="13" /> <span>Asigna una lista</span>
          </div>
          <button
            v-if="isDraft"
            class="btn-ghost"
            @click="openEditor"
            title="Editor de plantillas"
          >
            <ExternalLink :size="14" /> <span>Editor</span>
          </button>
          <button
            v-if="canTest"
            class="btn-ghost btn-test"
            @click="showTestModal = true"
            title="Enviar prueba sin afectar a la campaña"
          >
            <FlaskConical :size="14" /> <span>Test</span>
          </button>
          <button
            v-if="canSend"
            class="btn-send"
            :disabled="sending"
            @click="sendCampaign"
            title="Enviar campaña"
          >
            <Loader2 v-if="sending" :size="15" class="spin" />
            <Send v-else :size="15" />
            <span v-if="sending">Enviando…</span>
            <span v-else>Enviar<span class="btn-send-long">&nbsp;campaña</span></span>
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
          <template v-if="isDraft || isScheduled">
            <!-- Planificación de Envío Premium -->
            <div class="config-card" :class="{ 'card-scheduled': isScheduled }">
              <div class="cc-label">Programación de envío</div>
              
              <!-- Case 1: Campaign is Draft -->
              <template v-if="isDraft">
                <div class="sched-toggle-row">
                  <label class="sched-switch-label">
                    <input type="checkbox" v-model="isScheduledMode" class="sched-checkbox" />
                    <span>Programar envío automático</span>
                  </label>
                </div>
                
                <Transition name="fade-slide">
                  <div v-if="isScheduledMode" class="sched-picker-container">
                    <div 
                      class="premium-date-container" 
                      :class="{ 'has-error': scheduleInput && !isScheduleInputValid }"
                      @click="dateInputRef?.showPicker()"
                    >
                      <Calendar :size="16" class="picker-icon" />
                      <input 
                        ref="dateInputRef"
                        v-model="scheduleInput" 
                        type="datetime-local" 
                        class="premium-date-input" 
                        :min="minDateTime"
                      />
                    </div>
                    <p v-if="scheduleInput && !isScheduleInputValid" class="field-hint" style="color: #ef4444; display: flex; align-items: center; gap: 4px; margin-top: 6px;">
                      <AlertCircle :size="12" /> La fecha debe estar en el futuro.
                    </p>
                    <button 
                      class="btn-schedule-action" 
                      :disabled="!isScheduleInputValid || saving"
                      @click="scheduleCampaign"
                    >
                      <Loader2 v-if="saving" :size="13" class="spin" />
                      Programar Campaña
                    </button>
                  </div>
                </Transition>
              </template>

              <!-- Case 2: Campaign is Scheduled -->
              <template v-else-if="isScheduled">
                <div class="scheduled-dashboard">
                  <div class="sched-dash-header">
                    <div class="sched-dash-icon-wrap">
                      <Clock :size="20" class="spin-slow" />
                    </div>
                    <div class="sched-dash-info">
                      <span class="sched-dash-time-title">Envío automático programado</span>
                      <span class="sched-dash-time-val">{{ fmtDate(campaign.scheduledAt) }}</span>
                    </div>
                  </div>

                  <!-- Dynamic pulsing countdown banner -->
                  <div class="countdown-banner">
                    <span class="countdown-pulse-dot"></span>
                    <span class="countdown-lbl">{{ countdownText || "Calculando..." }}</span>
                  </div>

                  <!-- Actions -->
                  <div class="sched-dash-actions">
                    <button class="btn-dash-action secondary" @click="isScheduledMode = !isScheduledMode">
                      {{ isScheduledMode ? "Ocultar" : "Editar" }}
                    </button>
                    <button class="btn-dash-action danger" @click="unscheduleCampaign" :disabled="saving">
                      Desprogramar
                    </button>
                    <button class="btn-dash-action primary" @click="sendScheduledNow" :disabled="saving">
                      Enviar ahora
                    </button>
                  </div>

                  <!-- Edit form if inside editing schedule mode -->
                  <Transition name="fade-slide">
                    <div v-if="isScheduledMode" class="sched-picker-container" style="margin-top: 14px;">
                      <div 
                        class="premium-date-container" 
                        :class="{ 'has-error': scheduleInput && !isScheduleInputValid }"
                        @click="dateInputRef?.showPicker()"
                      >
                        <Calendar :size="16" class="picker-icon" />
                        <input 
                          ref="dateInputRef"
                          v-model="scheduleInput" 
                          type="datetime-local" 
                          class="premium-date-input" 
                          :min="minDateTime"
                        />
                      </div>
                      <p v-if="scheduleInput && !isScheduleInputValid" class="field-hint" style="color: #ef4444; display: flex; align-items: center; gap: 4px; margin-top: 6px;">
                        <AlertCircle :size="12" /> La fecha debe estar en el futuro.
                      </p>
                      <button 
                        class="btn-schedule-action" 
                        :disabled="!isScheduleInputValid || saving"
                        @click="scheduleCampaign"
                      >
                        <Loader2 v-if="saving" :size="13" class="spin" />
                        Actualizar Programación
                      </button>
                    </div>
                  </Transition>
                </div>
              </template>
            </div>

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
                  :disabled="isScheduled"
                />
                <button
                  v-if="subjectInput && !isScheduled"
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
                  v-for="v in displayVars"
                  :key="v"
                  @click="insertVar(v)"
                  class="var-chip"
                  :disabled="isScheduled"
                >
                  {{ v.replaceAll("{", "").replaceAll("}", "") }}
                </button>
              </div>
              <p v-if="isScheduled" class="field-hint" style="color: #f59e0b; display: flex; align-items: center; gap: 4px; margin-top: 8px;">
                <AlertCircle :size="12" /> Campaña programada · Desprograma para modificar
              </p>
            </div>

            <!-- A/B subject test -->
            <div class="config-card">
              <div class="cc-label ab-label-row">
                <span>Test A/B de asunto</span>
                <span v-if="campaign.abPhase" class="ab-phase-badge" :class="`ab-${campaign.abPhase}`">
                  {{ abPhaseLabel }}
                </span>
              </div>

              <template v-if="isDraft">
                <div class="input-wrap">
                  <input
                    v-model="campaign.subjectB"
                    @input="scheduleSave"
                    @blur="commitSave"
                    type="text"
                    class="field-input"
                    placeholder="Asunto B (vacío = sin test A/B)"
                  />
                  <button
                    v-if="campaign.subjectB"
                    @click="
                      campaign.subjectB = '';
                      scheduleSave();
                    "
                    class="btn-clear"
                  >
                    ×
                  </button>
                </div>
                <div v-if="campaign.subjectB" class="ab-config-row">
                  <label class="ab-config-item">
                    Muestra
                    <select v-model.number="campaign.abSamplePct" class="field-input ab-select" @change="commitSave">
                      <option v-for="p in [10, 20, 30, 40, 50]" :key="p" :value="p">{{ p }}%</option>
                    </select>
                  </label>
                  <label class="ab-config-item">
                    Decidir tras
                    <select v-model.number="campaign.abWaitMinutes" class="field-input ab-select" @change="commitSave">
                      <option :value="60">1 hora</option>
                      <option :value="120">2 horas</option>
                      <option :value="240">4 horas</option>
                      <option :value="480">8 horas</option>
                      <option :value="1440">24 horas</option>
                    </select>
                  </label>
                </div>
                <p v-if="campaign.subjectB" class="field-hint" style="margin-top: 8px">
                  Se envía la muestra 50/50 entre A y B; el asunto con más aperturas va al resto automáticamente.
                </p>
              </template>

              <div v-else-if="campaign.abPhase" class="ab-results">
                <div class="ab-variant-row">
                  <span class="ab-variant-tag">A</span>
                  <span class="ab-variant-subject">{{ campaign.subject }}</span>
                  <span class="ab-variant-stats">{{ abStats.A.opens }}/{{ abStats.A.sent }} aperturas</span>
                  <Check v-if="campaign.abWinner === 'A'" :size="14" class="ab-winner-icon" />
                </div>
                <div class="ab-variant-row">
                  <span class="ab-variant-tag b">B</span>
                  <span class="ab-variant-subject">{{ campaign.subjectB }}</span>
                  <span class="ab-variant-stats">{{ abStats.B.opens }}/{{ abStats.B.sent }} aperturas</span>
                  <Check v-if="campaign.abWinner === 'B'" :size="14" class="ab-winner-icon" />
                </div>
                <p v-if="campaign.abPhase === 'waiting'" class="field-hint" style="margin-top: 8px">
                  Muestra enviada · el ganador se decidirá
                  {{ campaign.abDecideAt ? `el ${new Date(campaign.abDecideAt).toLocaleString("es-ES")}` : "pronto" }}
                  ({{ abStats.held }} contactos en espera)
                </p>
              </div>

              <p v-else class="field-hint">Sin test A/B en esta campaña.</p>
            </div>

            <!-- Auto follow-up (drip) -->
            <div class="config-card">
              <div class="cc-label ab-label-row">
                <span>Seguimiento automático</span>
                <span
                  v-if="campaign.followUpCampaignId"
                  class="ab-phase-badge ab-final"
                  >Enviado</span
                >
                <span
                  v-else-if="campaign.followUpDoneAt"
                  class="ab-phase-badge ab-final"
                  >Todos abrieron</span
                >
                <span
                  v-else-if="campaign.followUpSubject && campaign.status === 'sent'"
                  class="ab-phase-badge ab-waiting"
                  >Programado</span
                >
              </div>

              <template v-if="isDraft">
                <div class="input-wrap">
                  <input
                    v-model="campaign.followUpSubject"
                    @input="scheduleSave"
                    @blur="commitSave"
                    type="text"
                    class="field-input"
                    placeholder="Asunto del seguimiento (vacío = sin seguimiento)"
                  />
                  <button
                    v-if="campaign.followUpSubject"
                    @click="
                      campaign.followUpSubject = '';
                      scheduleSave();
                    "
                    class="btn-clear"
                  >
                    ×
                  </button>
                </div>
                <div v-if="campaign.followUpSubject" class="ab-config-row">
                  <label class="ab-config-item">
                    Enviar tras
                    <select
                      v-model.number="campaign.followUpDelayHours"
                      class="field-input ab-select"
                      @change="commitSave"
                    >
                      <option :value="24">24 horas</option>
                      <option :value="48">48 horas</option>
                      <option :value="72">3 días</option>
                      <option :value="168">1 semana</option>
                    </select>
                  </label>
                </div>
                <p v-if="campaign.followUpSubject" class="field-hint" style="margin-top: 8px">
                  Tras terminar el envío, quien no haya abierto en ese plazo recibirá
                  el mismo email con este asunto, automáticamente.
                </p>
              </template>

              <template v-else-if="campaign.followUpSubject">
                <p class="field-hint">
                  <template v-if="campaign.followUpCampaignId">
                    Seguimiento enviado ·
                    <NuxtLink
                      :to="`/campaigns/${campaign.followUpCampaignId}`"
                      class="followup-link"
                      >ver campaña de seguimiento →</NuxtLink
                    >
                  </template>
                  <template v-else-if="campaign.followUpDoneAt">
                    No hizo falta enviar seguimiento — todos los destinatarios abrieron el email.
                  </template>
                  <template v-else-if="campaign.status === 'sent' && campaign.finishedAt">
                    «{{ campaign.followUpSubject }}» se enviará a los no-abridores el
                    {{ followUpEta }}.
                  </template>
                  <template v-else>
                    Seguimiento configurado: «{{ campaign.followUpSubject }}» ({{ campaign.followUpDelayHours }}h tras el envío).
                  </template>
                </p>
              </template>

              <p v-else class="field-hint">Sin seguimiento automático en esta campaña.</p>
            </div>

            <!-- List -->
            <div class="config-card">
              <div class="cc-label">Lista de destinatarios</div>
              <div class="select-wrap">
                <select
                  class="field-input"
                  :value="campaign.listId ?? ''"
                  @change="changeList"
                  :disabled="isScheduled"
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
              <p v-if="isScheduled" class="field-hint" style="color: #f59e0b; display: flex; align-items: center; gap: 4px; margin-top: 8px;">
                <AlertCircle :size="12" /> Campaña programada · Desprograma para modificar
              </p>
            </div>

            <!-- Segmentation -->
            <div v-if="campaign.listId && availableTags.length" class="config-card">
              <div class="cc-label">{{ t("segment.title") }}</div>
              <div class="seg-tags">
                <button
                  v-for="tg in availableTags"
                  :key="tg.tag"
                  class="seg-tag"
                  :class="{ active: tagSelected(tg.tag) }"
                  :disabled="isScheduled"
                  @click="toggleTag(tg.tag)"
                >
                  {{ tg.tag }} <span class="seg-count">{{ tg.count }}</span>
                </button>
              </div>
              <p class="field-hint">
                {{
                  campaign.tagFilter?.length
                    ? t("segment.hint_active", { count: campaign.tagFilter.length })
                    : t("segment.hint_all")
                }}
              </p>
            </div>

            <!-- Template -->
            <div class="config-card">
              <div class="cc-label">Plantilla HTML</div>
              <div class="tpl-btns">
                <button class="tpl-btn" @click="showLibrary = true" :disabled="isScheduled">
                  <BookOpen :size="15" /> Biblioteca
                </button>
                <button class="tpl-btn" @click="triggerFile" :disabled="isScheduled">
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
              <p v-if="isScheduled" class="field-hint" style="color: #f59e0b; display: flex; align-items: center; gap: 4px; margin-top: 8px;">
                <AlertCircle :size="12" /> Campaña programada · Desprograma para modificar
              </p>
            </div>

            <!-- Subscription emails (optional) -->
            <div class="config-card">
              <button
                class="cc-toggle"
                @click="showEmailConfig = !showEmailConfig"
              >
                <span class="cc-label" style="margin: 0"
                  >Emails de suscripción</span
                >
                <span class="cc-toggle-hint"
                  >{{ showEmailConfig ? "▲" : "▼" }} opcional</span
                >
              </button>
              <template v-if="showEmailConfig">
                <div class="email-cfg-grid">
                  <div class="email-cfg-group">
                    <div class="cc-sublabel">Asunto — email de baja</div>
                    <input
                      v-model="campaign.unsubEmailSubject"
                      @input="scheduleSave"
                      type="text"
                      class="field-input"
                      placeholder="Predeterminado: Has sido dado de baja"
                      :disabled="isScheduled"
                    />
                    <div class="cc-sublabel" style="margin-top: 8px">
                      Mensaje — email de baja
                    </div>
                    <textarea
                      v-model="campaign.unsubEmailMessage"
                      @input="scheduleSave"
                      class="field-input field-textarea"
                      placeholder="Predeterminado: hemos procesado tu solicitud…"
                      rows="3"
                      :disabled="isScheduled"
                    />
                  </div>
                  <div class="email-cfg-group">
                    <div class="cc-sublabel">Asunto — email de alta</div>
                    <input
                      v-model="campaign.resubEmailSubject"
                      @input="scheduleSave"
                      type="text"
                      class="field-input"
                      placeholder="Predeterminado: Suscripción restaurada"
                      :disabled="isScheduled"
                    />
                    <div class="cc-sublabel" style="margin-top: 8px">
                      Mensaje — email de alta
                    </div>
                    <textarea
                      v-model="campaign.resubEmailMessage"
                      @input="scheduleSave"
                      class="field-input field-textarea"
                      placeholder="Predeterminado: Hemos restaurado tu suscripción…"
                      rows="3"
                      :disabled="isScheduled"
                    />
                  </div>
                </div>
              </template>
              <p v-if="isScheduled" class="field-hint" style="color: #f59e0b; display: flex; align-items: center; gap: 4px; margin-top: 8px;">
                <AlertCircle :size="12" /> Campaña programada · Desprograma para modificar
              </p>
            </div>
          </template>

          <!-- SENT: stats + sends table -->
          <template v-else>
            <div
              class="stats-grid"
              :class="{ 'sending-mode': campaign.status === 'sending' }"
            >
              <div
                class="stat-card"
                :class="{ 'is-active': campaign.status === 'sending' }"
              >
                <div class="stat-icon-wrap si-gray"><Mail :size="18" /></div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.sentCount ?? 0 }}</span>
                  <span class="stat-lbl">{{ t("results.sent") }}</span>
                </div>
                <div
                  v-if="campaign.status === 'sending'"
                  class="stat-pulse"
                ></div>
              </div>
              <div class="stat-card">
                <div class="stat-icon-wrap si-purple"><Eye :size="18" /></div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.openCount ?? 0 }}</span>
                  <span class="stat-lbl">{{
                    t("campaigns_page.open_rate")
                  }}</span>
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-icon-wrap si-blue">
                  <MousePointerClick :size="18" />
                </div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.clickCount ?? 0 }}</span>
                  <span class="stat-lbl">{{
                    t("campaigns_page.click_rate")
                  }}</span>
                </div>
              </div>
              <div
                class="stat-card"
                :class="{ 'has-errors': campaign.failCount > 0 }"
              >
                <div class="stat-icon-wrap si-red"><XCircle :size="18" /></div>
                <div class="stat-body">
                  <span class="stat-num">{{ campaign.failCount ?? 0 }}</span>
                  <span class="stat-lbl">{{ t("results.failed") }}</span>
                </div>
              </div>
            </div>
            <!-- Bounce check -->
            <div
              v-if="campaign.status === 'sent' || campaign.status === 'paused'"
              class="bounce-check-row"
            >
              <button
                class="btn-check-bounces"
                :disabled="checkingBounces"
                @click="checkBounces(false)"
                title="Conecta al buzón IMAP del remitente y procesa NDR (Non-Delivery Reports)"
              >
                <Loader2 v-if="checkingBounces" :size="13" class="spin" />
                <RotateCcw v-else :size="13" />
                {{ checkingBounces ? "Verificando…" : "Verificar rebotes" }}
              </button>
              <button
                class="btn-bounce-log"
                @click="
                  showBounceLog = !showBounceLog;
                  if (showBounceLog) refreshBounceLog();
                "
                title="Ver log de diagnóstico IMAP"
              >
                {{ showBounceLog ? "▲ Log" : "▼ Log" }}
              </button>
              <button
                v-if="
                  campaign.status === 'sent' &&
                  !campaign.resendOfId &&
                  unopenedCount > 0
                "
                class="btn-check-bounces"
                :disabled="creatingFollowUp"
                @click="createFollowUp"
                title="Crea un borrador de seguimiento para los contactos que no abrieron este email"
              >
                <Loader2 v-if="creatingFollowUp" :size="13" class="spin" />
                <Mail v-else :size="13" />
                Reenviar a no abiertos ({{ unopenedCount }})
              </button>
            </div>
            <div
              v-if="
                showBounceLog &&
                (campaign.status === 'sent' || campaign.status === 'paused')
              "
              class="bounce-log-box"
            >
              <div v-if="bounceLog.length === 0" class="bounce-log-empty">
                Sin entradas de log — haz click en "Verificar rebotes"
              </div>
              <div
                v-for="(line, i) in bounceLog"
                :key="i"
                class="bounce-log-line"
              >
                {{ line }}
              </div>
            </div>

            <!-- Paused banner -->
            <div
              v-if="
                campaign.status === 'paused' && campaign.totalRecipients > 0
              "
              class="paused-banner"
            >
              <div class="paused-banner-left">
                <span class="paused-dot" />
                <span class="paused-text">
                  Pausado · <strong>{{ campaign.sentCount }}</strong> enviados,
                  <strong>{{ pendingCount }}</strong> pendientes
                </span>
              </div>
              <button
                class="paused-resume-btn"
                :disabled="sending"
                @click="resumeFromPage"
              >
                <Loader2 v-if="sending" :size="13" class="spin" />
                <Send v-else :size="13" />
                Reanudar envío
              </button>
            </div>

            <!-- Top clicked links -->
            <template v-if="linkStats.length > 0">
              <div class="section-hdr">Enlaces más clicados</div>
              <div class="link-stats">
                <div
                  v-for="l in linkStats.slice(0, 8)"
                  :key="l.url"
                  class="link-stat-row"
                  :title="l.url"
                >
                  <div
                    class="link-stat-bar"
                    :style="{ width: `${(l.clicks / maxLinkClicks) * 100}%` }"
                  ></div>
                  <MousePointerClick :size="12" class="link-stat-icon" />
                  <a
                    :href="l.url"
                    target="_blank"
                    rel="noopener"
                    class="link-stat-url"
                    >{{ shortUrl(l.url) }}</a
                  >
                  <span class="link-stat-count">
                    {{ l.clicks }} clicks · {{ l.uniqueClickers }} únicos
                  </span>
                </div>
              </div>
            </template>

            <div class="section-hdr">Destinatarios</div>
            <div class="table-wrap">
              <div v-if="sendsList.length === 0" class="table-empty">
                Sin registros de envío
              </div>
              <table v-else class="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Email</th>
                    <th>Empresa</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in sendsList" :key="s.id">
                    <td class="td-action">
                      <button
                        v-if="
                          s.status === 'failed' ||
                          s.status === 'pending' ||
                          s.status === 'bounced'
                        "
                        class="row-resend-btn"
                        :disabled="
                          resendingSingle !== null ||
                          campaign.status === 'sending'
                        "
                        :title="
                          s.status === 'bounced'
                            ? 'Reenviar (rebotado)'
                            : s.status === 'failed'
                              ? 'Reintentar envío'
                              : 'Enviar ahora'
                        "
                        @click="resendSingle(s.id)"
                      >
                        <Loader2
                          v-if="resendingSingle === s.id"
                          :size="12"
                          class="spin"
                        />
                        <RotateCcw v-else :size="12" />
                      </button>
                    </td>
                    <td class="td-email">{{ s.email }}</td>
                    <td class="td-name">{{ s.contactCompany || "—" }}</td>
                    <td>
                      <span
                        class="send-badge"
                        :class="SEND_BADGE[s.status]"
                        :title="s.errorMsg || undefined"
                      >
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
          <div class="preview-as-row">
            <Eye :size="13" class="preview-as-icon" />
            <select
              v-model="previewContactId"
              class="preview-as-select"
              title="Renderiza la plantilla con los datos reales de un contacto"
            >
              <option :value="null">Vista genérica (sin datos)</option>
              <option
                v-for="c in previewContacts"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name || c.email }}{{ c.company ? ` · ${c.company}` : "" }}
              </option>
            </select>
            <Loader2 v-if="loadingPreview" :size="13" class="spin" />
          </div>
          <CampaignPreview
            :html="personalizedPreview?.html ?? campaign.templateHtml ?? ''"
            :subject="
              personalizedPreview?.subject ?? (subjectInput || campaign.subject)
            "
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

      <!-- Test send modal -->
      <Transition name="fade-scale">
        <TestSendModal
          v-if="showTestModal"
          :campaign-id="id"
          :list-id="campaign.listId"
          @close="showTestModal = false"
        />
      </Transition>

      <!-- Pre-send checklist -->
      <Transition name="fade-scale">
        <PreSendChecklist
          v-if="showPrecheck"
          :campaign-id="id"
          @confirm="doSendCampaign"
          @close="showPrecheck = false"
        />
      </Transition>

      <!-- Sending Overlay -->
      <Transition name="overlay-fade">
        <div
          v-if="campaign.status === 'sending' && !dismissOverlay"
          class="sending-overlay"
        >
          <div class="overlay-content">
            <div class="magic-core">
              <div class="pulse-ring r1"></div>
              <div class="core-icon">
                <Send :size="42" />
              </div>
            </div>

            <div class="overlay-text">
              <div class="live-indicator">
                <span class="live-dot"></span>
                <span>{{ t("campaigns_page.status_sending") }}</span>
              </div>
              <h2>{{ campaign.name }}</h2>
              <p>{{ t("campaigns_page.sending_in_progress") }}</p>
            </div>

            <div class="overlay-stats">
              <div class="o-stat">
                <span class="o-val">{{
                  campaign.sentCount + campaign.failCount
                }}</span>
                <span class="o-lbl">{{ t("results.sent") }}</span>
              </div>
              <div class="o-divider"></div>
              <div class="o-stat">
                <span class="o-val">{{ campaign.totalRecipients }}</span>
                <span class="o-lbl">{{ t("campaigns_page.recipients") }}</span>
              </div>
            </div>

            <button class="btn-minimize" @click="dismissOverlay = true">
              {{ t("campaigns_page.view_dashboard") }}
            </button>
          </div>
        </div>
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
  padding: 0;
}
@media (max-width: 1024px) {
  .cpage {
    padding: 0 16px;
  }
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
  padding: 24px 0;
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
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 5px;
  font-size: 13px;
  color: var(--text-muted);
}
.hdr-meta > span {
  display: flex;
  align-items: center;
}
.hdr-meta > span:not(:first-child)::before {
  content: "·";
  margin-right: 8px;
  font-weight: 900;
  color: var(--text-dim);
}

@media (max-width: 640px) {
  .hdr-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .hdr-meta > span:not(:first-child)::before {
    display: none;
  }
}

.hdr-date,
.hdr-list {
  white-space: nowrap;
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
  height: 38px;
  padding: 0 22px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(5px);
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
  height: 38px;
  padding: 0 32px;
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
.btn-test {
  padding: 0 12px;
  gap: 5px;
  font-size: 12px;
}
.btn-test:hover {
  color: var(--accent-light);
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(99, 102, 241, 0.08);
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
  backdrop-filter: blur(5px);
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
.stats-grid.sending-mode {
  gap: 16px;
}

.stat-card {
  background: transparent;
  backdrop-filter: blur(5px);
  border: 1px solid var(--border);
  padding: 20px 24px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(5px);
}
.stat-card.is-active {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.05);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.1);
}
.stat-card.has-errors {
  border-color: rgba(239, 68, 68, 0.3);
}

.stat-pulse {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: scan-line 2s linear infinite;
}
@keyframes scan-line {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.stat-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.si-gray {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
}
.si-purple {
  background: rgba(168, 85, 247, 0.1);
  color: #a855f7;
}
.si-blue {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
.si-red {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
.stat-body {
  display: flex;
  flex-direction: column;
}
.stat-num {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  line-height: 1;
}
.stat-lbl {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}
.stat-lbl strong {
  color: var(--text);
}
.stat-retry-btn {
  margin: auto;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.stat-retry-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  transform: translateY(-1px);
}
.stat-retry-btn:active {
  transform: translateY(0);
}

/* Sending Status Card */
.sending-status-container {
  margin-bottom: 24px;
  animation: slide-down 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sending-status-card {
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.1),
    rgba(0, 0, 0, 0.2)
  );
  border: 1px solid var(--accent);
  border-radius: 20px;
  padding: 24px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}

.ssc-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.ssc-label-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ssc-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.live-dot {
  width: 6px;
  height: 6px;
  background: #ef4444;
  border-radius: 50%;
  box-shadow: 0 0 10px #ef4444;
  animation: live-pulse 1.5s infinite;
}
@keyframes live-pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.5);
    opacity: 0.5;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.ssc-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  opacity: 0.9;
}
.ssc-pct {
  font-size: 32px;
  font-weight: 900;
  color: var(--accent-light);
  font-family: monospace;
}

.ssc-progress-track {
  height: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 20px;
  position: relative;
}
.ssc-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  border-radius: 10px;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
.ssc-progress-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: shimmer-swipe 2s infinite;
}
@keyframes shimmer-swipe {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

.ssc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ssc-count {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.ssc-current {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}
.ssc-separator {
  font-size: 14px;
  opacity: 0.3;
}
.ssc-total {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.6;
}
.ssc-unit {
  font-size: 11px;
  margin-left: 8px;
  opacity: 0.4;
  text-transform: uppercase;
  font-weight: 700;
}

.ssc-engine-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-dim);
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Sending Overlay */
.sending-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(5, 6, 14, 0.7);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.overlay-content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 400px;
  width: 100%;
  background: rgba(13, 16, 23, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 32px 24px;
  border-radius: 24px;
  backdrop-filter: blur(20px);
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.7);
}

.magic-core {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.core-icon {
  position: relative;
  z-index: 5;
  color: var(--accent-light);
  filter: drop-shadow(0 0 15px rgba(99, 102, 241, 0.4));
  animation: core-pulse-slow 3s ease-in-out infinite;
}

@keyframes core-pulse-slow {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.9;
  }
  50% {
    transform: scale(1.08);
    opacity: 1;
  }
}

.pulse-ring {
  position: absolute;
  border: 1px solid var(--accent);
  border-radius: 50%;
  opacity: 0;
  width: 100%;
  height: 100%;
  animation: ring-pulse-elegant 4s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

@keyframes ring-pulse-elegant {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  50% {
    opacity: 0.3;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

.r1 {
  width: 100%;
  height: 100%;
  animation-delay: 0s;
}
.r2 {
  width: 100%;
  height: 100%;
  animation-delay: 1s;
}
.r3 {
  width: 100%;
  height: 100%;
  animation-delay: 2s;
}

@keyframes ring-pulse {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  20% {
    opacity: 0.4;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

.overlay-text h2 {
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  margin: 12px 0 6px;
  letter-spacing: -0.01em;
}

.overlay-text p {
  color: var(--text-dim);
  font-size: 14px;
  max-width: 260px;
  margin: 0 auto 24px;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.overlay-stats {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-bottom: 32px;
  background: rgba(255, 255, 255, 0.02);
  padding: 16px 32px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.o-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.o-val {
  font-size: 22px;
  font-weight: 900;
  color: #fff;
  font-family: monospace;
}

.o-lbl {
  font-size: 10px;
  font-weight: 800;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.o-divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
}

.btn-minimize {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-minimize:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  border-color: var(--text-dim);
}

/* Transitions */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
.overlay-fade-enter-from .overlay-content {
  transform: scale(0.95) translateY(10px);
}

/* Body */
.cpage-body {
  flex: 1;
  display: grid;
  grid-template-columns: 40% 1fr;
  gap: 24px;
  padding: 24px 0;
  align-items: start;
}

/* Left */
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
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

.cc-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-bottom: 0;
}
.cc-toggle-hint {
  font-size: 10px;
  color: var(--text-dim);
  font-weight: 600;
}
.cc-sublabel {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 5px;
}
.email-cfg-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.email-cfg-group {
  display: flex;
  flex-direction: column;
}
.field-textarea {
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
  line-height: 1.5;
  padding-top: 8px;
  padding-bottom: 8px;
}

/* Bounce check row */
.bounce-check-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-check-bounces {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.18);
  border-radius: 9px;
  color: var(--accent-light);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.btn-check-bounces:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.14);
  border-color: rgba(99, 102, 241, 0.35);
}
.btn-check-bounces:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.bounce-check-hint {
  font-size: 11px;
  color: var(--text-dim);
}
.btn-bounce-log {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 9px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-bounce-log:hover {
  background: rgb(0 0 0 / 6%);
  color: var(--text);
}
.bounce-log-box {
  background: rgb(0 0 0 / 40%);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: monospace;
  font-size: 10px;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bounce-log-line {
  color: var(--text-muted);
  line-height: 1.5;
  word-break: break-all;
}
.bounce-log-empty {
  color: var(--text-dim);
  font-size: 11px;
  text-align: center;
  padding: 12px 0;
}

/* Paused banner */
.paused-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 14px;
  padding: 12px 16px;
  margin-bottom: 4px;
}
.paused-banner-left {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.paused-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
}
.paused-text {
  font-size: 13px;
  color: var(--text-muted);
}
.paused-text strong {
  color: #f59e0b;
  font-weight: 700;
}
.paused-resume-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 16px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 10px;
  color: var(--accent-light);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.paused-resume-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.5);
}
.paused-resume-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Row resend button */
.td-action {
  width: 32px;
  padding: 0 8px 0 0;
  text-align: right;
}
.row-resend-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 7px;
  color: var(--accent-light);
  cursor: pointer;
  transition: all 0.15s;
}
.row-resend-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
}
.row-resend-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
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
  backdrop-filter: blur(5px);
  border-radius: 14px;
  overflow-y: auto;
  overflow-x: auto;
  max-height: 34vh;
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
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
.bd-bounced {
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
}
.send-error-hint {
  font-size: 10px;
  color: var(--text-dim);
  margin-top: 3px;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.75;
}

/* Right preview */
.right-preview {
  position: sticky;
  top: 20px;
  backdrop-filter: blur(5px);
  min-width: 0;
}

.preview-as-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.preview-as-icon {
  color: var(--text-dim);
  flex-shrink: 0;
}
.preview-as-select {
  flex: 1;
  min-width: 0;
  background: rgb(0 0 0 / 15%);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 12px;
  padding: 7px 10px;
  cursor: pointer;
}
.preview-as-select:focus {
  outline: none;
  border-color: #6366f1;
}

/* ── A/B test card ── */
.ab-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ab-phase-badge {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-radius: 20px;
  padding: 3px 10px;
}
.ab-phase-badge.ab-sample {
  background: rgb(99 102 241 / 15%);
  color: #818cf8;
}
.ab-phase-badge.ab-waiting {
  background: rgb(250 204 21 / 12%);
  color: #facc15;
}
.ab-phase-badge.ab-final {
  background: rgb(34 197 94 / 12%);
  color: #22c55e;
}
.ab-config-row {
  display: flex;
  gap: 14px;
  margin-top: 10px;
}
.ab-config-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.ab-select {
  width: auto;
  padding: 6px 10px;
  font-size: 12px;
}
.ab-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ab-variant-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgb(0 0 0 / 12%);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 12px;
}
.ab-variant-tag {
  font-size: 11px;
  font-weight: 800;
  color: #818cf8;
  background: rgb(99 102 241 / 15%);
  border-radius: 6px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ab-variant-tag.b {
  color: #f97316;
  background: rgb(249 115 22 / 15%);
}
.ab-variant-subject {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ab-variant-stats {
  font-size: 11px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.ab-winner-icon {
  color: #22c55e;
  flex-shrink: 0;
}
.followup-link {
  color: #818cf8;
  text-decoration: none;
  font-weight: 700;
}
.followup-link:hover {
  text-decoration: underline;
}

/* ── Manual status switch ── */
.status-switch {
  position: relative;
  display: inline-flex;
}
.status-switch-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  cursor: pointer;
  font: inherit;
}
.status-switch-btn:disabled {
  cursor: default;
}
.status-chevron {
  opacity: 0.6;
}
.status-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 160px;
  background: var(--bg-card, #16182a);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 40%);
}
.status-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.status-menu-item:hover:not(:disabled) {
  background: rgb(255 255 255 / 7%);
  color: #fff;
}
.status-menu-item:disabled,
.status-menu-item.current {
  opacity: 0.45;
  cursor: default;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  padding: 0;
}
.status-dot.st-draft {
  background: #94a3b8;
}
.status-dot.st-sent {
  background: #22c55e;
}
.status-dot.st-paused {
  background: #f59e0b;
}
.status-dot.st-scheduled {
  background: #818cf8;
}

/* ── Link click stats ── */
.link-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}
.link-stat-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.link-stat-bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgb(99 102 241 / 12%);
  pointer-events: none;
}
.link-stat-icon {
  color: #818cf8;
  flex-shrink: 0;
  position: relative;
}
.link-stat-url {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
}
.link-stat-url:hover {
  color: #818cf8;
}
.link-stat-count {
  font-size: 11px;
  color: var(--text-dim);
  flex-shrink: 0;
  position: relative;
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
  .cpage-body {
    padding: 20px 24px 32px;
    gap: 20px;
  }
}

@media (max-width: 900px) {
  .cpage-body {
    grid-template-columns: 1fr;
  }
  .right-preview {
    position: static;
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
    align-items: stretch;
    gap: 10px;
    padding: 16px 0;
  }
  .hdr-left {
    flex: none;
    min-width: 0;
    gap: 10px;
  }
  .hdr-actions {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    width: 100%;
  }
  .hdr-warning {
    display: none;
  }
  .btn-send,
  .btn-ghost {
    flex: 0 0 auto;
    height: 40px;
    min-height: unset;
    padding: 0 12px;
    font-size: 13px;
    justify-content: center;
  }
  .hdr-actions span {
    display: inline;
  }
  .hdr-actions span.btn-send-long {
    display: none;
  }
  .btn-delete {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }
  .hdr-name {
    font-size: 17px;
  }
  .btn-icon-ghost {
    flex-shrink: 0;
  }
  .hdr-meta {
    font-size: 11px;
    gap: 4px 8px;
  }
  .hdr-meta > span:not(:first-child)::before {
    margin-right: 6px;
  }
  .hdr-date,
  .hdr-list {
    white-space: normal;
  }
  .cpage-body {
    padding: 20px 0;
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
    max-height: 300px;
    border-radius: 12px;
  }
  .data-table th,
  .data-table td {
    padding: 10px 12px;
    font-size: 10px;
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
  .hdr-name {
    font-size: 16px;
  }
  .btn-delete {
    width: 38px;
    height: 38px;
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

/* ── Planificación de Envío Premium ───────────────────────── */
.card-scheduled {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(15, 17, 35, 0.5)) !important;
  border-color: rgba(245, 158, 11, 0.25) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3), 0 0 1px rgba(245, 158, 11, 0.1);
}

.sched-toggle-row {
  display: flex;
  align-items: center;
  margin-top: 6px;
}

.sched-switch-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}

.sched-checkbox {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 2px solid var(--border);
  background: rgba(0, 0, 0, 0.2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.sched-checkbox:checked {
  background: var(--accent);
  border-color: var(--accent-light);
}

.sched-checkbox:checked::before {
  content: "✓";
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  position: absolute;
}

.sched-picker-container {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: slideDownFade 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.premium-date-container {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-width: 320px;
  position: relative;
  overflow: hidden;
}

.premium-date-container:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.1);
}

.premium-date-container:focus-within {
  background: rgba(0, 0, 0, 0.45);
  border-color: var(--accent);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
}

.premium-date-container.has-error {
  border-color: rgba(239, 68, 68, 0.4) !important;
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.15) !important;
}

.picker-icon {
  color: var(--accent-light);
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

.premium-date-container:hover .picker-icon {
  transform: scale(1.1);
}

.premium-date-input {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  width: 100%;
  cursor: pointer;
  font-family: inherit;
  color-scheme: dark;
}

.premium-date-input::-webkit-calendar-picker-indicator {
  opacity: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  cursor: pointer;
}

.btn-schedule-action {
  width: 100%;
  padding: 11px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-schedule-action:hover:not(:disabled) {
  filter: brightness(1.1);
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.25);
}

.btn-schedule-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Scheduled Dashboard */
.scheduled-dashboard {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sched-dash-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sched-dash-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(245, 158, 11, 0.1);
}

.spin-slow {
  animation: spinSlow 8s linear infinite;
}

@keyframes spinSlow {
  to {
    transform: rotate(360deg);
  }
}

.sched-dash-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sched-dash-time-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sched-dash-time-val {
  font-size: 14px;
  font-weight: 800;
  color: #fff;
}

/* Pulsing Countdown */
.countdown-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 10px;
  padding: 8px 12px;
}

.countdown-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 10px #f59e0b;
  animation: pulseDot 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulseDot {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(1.3);
  }
}

.countdown-lbl {
  font-size: 12px;
  font-weight: 700;
  color: #f59e0b;
  letter-spacing: 0.02em;
}

/* Dashboard Actions */
.sched-dash-actions {
  display: flex;
  gap: 6px;
}

.btn-dash-action {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.btn-dash-action.secondary {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  color: var(--text-dim);
}

.btn-dash-action.secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.btn-dash-action.danger {
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-dash-action.danger:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.3);
}

.btn-dash-action.primary {
  background: var(--accent);
  border: none;
  color: #fff;
}

.btn-dash-action.primary:hover {
  filter: brightness(1.12);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

/* Slide Down Fade Transition */
@keyframes slideDownFade {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Segmentation tag chips */
.seg-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.seg-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-hi);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-dim, #c9cbe0);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}
.seg-tag:hover:not(:disabled) {
  border-color: var(--accent, #6366f1);
}
.seg-tag.active {
  background: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
  color: #fff;
}
.seg-tag:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.seg-count {
  opacity: 0.65;
  font-size: 0.68rem;
}
</style>
