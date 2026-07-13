<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  X,
  Send,
  Loader2,
  Search,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Plus,
} from "lucide-vue-next";

const props = defineProps<{
  campaignId: number | string;
  listId?: number | null;
}>();
const emit = defineEmits<{ close: [] }>();

const MAX_RECIPIENTS = 10;

const selected = ref<string[]>([]);
const manualInput = ref("");
const manualError = ref("");
const search = ref("");
const contactResults = ref<any[]>([]);
const searching = ref(false);
const sending = ref(false);
const results = ref<{ email: string; ok: boolean; error?: string }[] | null>(
  null,
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const atLimit = computed(() => selected.value.length >= MAX_RECIPIENTS);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  if (props.listId) fetchContacts();
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

// ─── Contact search (from campaign list) ─────────────────────
let searchTimer: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchContacts, 300);
});

async function fetchContacts() {
  if (!props.listId) return;
  searching.value = true;
  try {
    const r = await $fetch<{ data: any[] }>("/api/contacts", {
      query: { list_id: props.listId, search: search.value || undefined },
    });
    contactResults.value = r.data;
  } catch {
    contactResults.value = [];
  } finally {
    searching.value = false;
  }
}

function isSelected(email: string) {
  return selected.value.includes(email.toLowerCase());
}

function toggleEmail(email: string) {
  const e = email.toLowerCase();
  const idx = selected.value.indexOf(e);
  if (idx >= 0) selected.value.splice(idx, 1);
  else if (!atLimit.value) selected.value.push(e);
}

// ─── Manual emails ───────────────────────────────────────────
function addManual() {
  manualError.value = "";
  const parts = manualInput.value
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return;
  for (const p of parts) {
    if (!EMAIL_RE.test(p)) {
      manualError.value = `Email no válido: ${p}`;
      return;
    }
  }
  for (const p of parts) {
    if (!selected.value.includes(p)) {
      if (atLimit.value) {
        manualError.value = `Máximo ${MAX_RECIPIENTS} destinatarios`;
        break;
      }
      selected.value.push(p);
    }
  }
  manualInput.value = "";
}

// ─── Send ────────────────────────────────────────────────────
async function sendTest() {
  if (!selected.value.length || sending.value) return;
  sending.value = true;
  results.value = null;
  try {
    const r = await $fetch<{
      results: { email: string; ok: boolean; error?: string }[];
    }>(`/api/campaigns/${props.campaignId}/test`, {
      method: "POST",
      body: { emails: selected.value },
    });
    results.value = r.results;
  } catch (e: any) {
    manualError.value = e.data?.statusMessage || e.message;
  } finally {
    sending.value = false;
  }
}

const allOk = computed(
  () => results.value !== null && results.value.every((r) => r.ok),
);
</script>

<template>
  <div class="modal-overlay glass-modal" @click.self="emit('close')">
    <div class="ts-window" role="dialog" aria-modal="true" aria-label="Envío de prueba">
      <div class="ts-header">
        <div class="ts-title">
          <FlaskConical :size="20" class="ts-title-icon" />
          <div>
            <h2>Envío de prueba</h2>
            <p>
              Envía la campaña a hasta {{ MAX_RECIPIENTS }} emails sin afectar
              al estado ni a las estadísticas
            </p>
          </div>
        </div>
        <button @click="emit('close')" class="btn-close"><X :size="18" /></button>
      </div>

      <div class="ts-body">
        <!-- Results view -->
        <template v-if="results">
          <ul class="ts-results">
            <li
              v-for="r in results"
              :key="r.email"
              class="ts-result"
              :class="r.ok ? 'ok' : 'fail'"
            >
              <CheckCircle2 v-if="r.ok" :size="15" />
              <XCircle v-else :size="15" />
              <span class="ts-result-email">{{ r.email }}</span>
              <span v-if="r.error" class="ts-result-err">{{ r.error }}</span>
            </li>
          </ul>
        </template>

        <!-- Selection view -->
        <template v-else>
          <!-- Manual input -->
          <div class="ts-section-label">Añadir email manualmente</div>
          <div class="ts-manual-row">
            <input
              v-model="manualInput"
              type="text"
              class="ts-input"
              placeholder="email@ejemplo.com"
              :disabled="atLimit"
              @keyup.enter="addManual"
            />
            <button
              class="ts-add-btn"
              :disabled="!manualInput.trim() || atLimit"
              @click="addManual"
            >
              <Plus :size="14" />
            </button>
          </div>
          <p v-if="manualError" class="ts-error">{{ manualError }}</p>

          <!-- Selected chips -->
          <div v-if="selected.length" class="ts-chips">
            <span v-for="e in selected" :key="e" class="ts-chip">
              {{ e }}
              <button class="ts-chip-x" @click="toggleEmail(e)">×</button>
            </span>
          </div>

          <!-- Contact picker from list -->
          <template v-if="listId">
            <div class="ts-section-label" style="margin-top: 14px">
              O elegir de la lista de destinatarios
            </div>
            <div class="ts-search-wrap">
              <Search :size="14" class="ts-search-icon" />
              <input
                v-model="search"
                type="text"
                class="ts-input ts-search-input"
                placeholder="Buscar contacto…"
              />
            </div>
            <div class="ts-contact-list">
              <div v-if="searching" class="ts-state">
                <Loader2 :size="15" class="spin" /> Buscando…
              </div>
              <div v-else-if="contactResults.length === 0" class="ts-state">
                Sin resultados
              </div>
              <button
                v-else
                v-for="c in contactResults"
                :key="c.id"
                class="ts-contact"
                :class="{ selected: isSelected(c.email) }"
                :disabled="!isSelected(c.email) && atLimit"
                @click="toggleEmail(c.email)"
              >
                <span class="ts-contact-check">
                  <CheckCircle2 v-if="isSelected(c.email)" :size="14" />
                </span>
                <span class="ts-contact-email">{{ c.email }}</span>
                <span v-if="c.name || c.company" class="ts-contact-meta">
                  {{ c.name || c.company }}
                </span>
              </button>
            </div>
          </template>
        </template>
      </div>

      <div class="ts-footer">
        <template v-if="results">
          <span class="ts-verdict" :class="allOk ? 'pass' : 'fail'">
            {{
              allOk
                ? "Todos los emails de prueba enviados"
                : "Algunos envíos fallaron"
            }}
          </span>
          <div class="ts-actions">
            <button class="btn-cancel" @click="results = null">Volver</button>
            <button class="btn-send-now" @click="emit('close')">Cerrar</button>
          </div>
        </template>
        <template v-else>
          <span class="ts-count">
            {{ selected.length }} / {{ MAX_RECIPIENTS }} seleccionados
          </span>
          <div class="ts-actions">
            <button class="btn-cancel" @click="emit('close')">Cancelar</button>
            <button
              class="btn-send-now"
              :disabled="!selected.length || sending"
              @click="sendTest"
            >
              <Loader2 v-if="sending" :size="14" class="spin" />
              <Send v-else :size="14" />
              {{ sending ? "Enviando…" : "Enviar prueba" }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts-window {
  max-width: 520px;
  width: 95%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: #090b14;
  border: 1px solid var(--border-hi);
  border-radius: 16px;
  overflow: hidden;
}
.ts-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-hi);
}
.ts-title {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.ts-title-icon {
  color: var(--accent, #6366f1);
  margin-top: 2px;
}
.ts-title h2 {
  font-size: 1rem;
  margin: 0 0 2px;
}
.ts-title p {
  font-size: 0.78rem;
  color: var(--text-dim, #8b8fa3);
  margin: 0;
}
.btn-close {
  background: none;
  border: none;
  color: var(--text-dim, #8b8fa3);
  cursor: pointer;
  padding: 4px;
}
.ts-body {
  padding: 14px 20px;
  overflow-y: auto;
  flex: 1;
}
.ts-section-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim, #8b8fa3);
  margin-bottom: 8px;
}
.ts-manual-row {
  display: flex;
  gap: 8px;
}
.ts-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-hi);
  border-radius: 8px;
  color: var(--text, #e5e7f0);
  padding: 8px 12px;
  font-size: 0.83rem;
  outline: none;
}
.ts-input:focus {
  border-color: var(--accent, #6366f1);
}
.ts-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  background: var(--accent, #6366f1);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.ts-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ts-error {
  color: #f87171;
  font-size: 0.75rem;
  margin: 6px 0 0;
}
.ts-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.ts-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-light, #a5b4fc);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 14px;
  padding: 3px 6px 3px 10px;
  font-size: 0.76rem;
  font-weight: 600;
}
.ts-chip-x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 3px;
  opacity: 0.7;
}
.ts-chip-x:hover {
  opacity: 1;
}
.ts-search-wrap {
  position: relative;
  margin-bottom: 8px;
}
.ts-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim, #8b8fa3);
  pointer-events: none;
}
.ts-search-input {
  width: 100%;
  padding-left: 30px;
  box-sizing: border-box;
}
.ts-contact-list {
  border: 1px solid var(--border-hi);
  border-radius: 10px;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.ts-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px;
  color: var(--text-dim, #8b8fa3);
  font-size: 0.8rem;
}
.ts-contact {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  color: var(--text, #e5e7f0);
  font-size: 0.8rem;
  transition: background 0.15s;
}
.ts-contact:last-child {
  border-bottom: none;
}
.ts-contact:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.03);
}
.ts-contact.selected {
  background: rgba(99, 102, 241, 0.08);
}
.ts-contact:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ts-contact-check {
  width: 16px;
  flex-shrink: 0;
  color: var(--accent-light, #a5b4fc);
  display: flex;
}
.ts-contact-email {
  font-weight: 600;
}
.ts-contact-meta {
  color: var(--text-dim, #8b8fa3);
  font-size: 0.73rem;
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
.ts-results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ts-result {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.82rem;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.ts-result.ok {
  color: #34d399;
}
.ts-result.fail {
  color: #f87171;
  background: rgba(248, 113, 113, 0.07);
}
.ts-result-email {
  color: var(--text, #e5e7f0);
  font-weight: 600;
}
.ts-result-err {
  margin-left: auto;
  font-size: 0.73rem;
  opacity: 0.9;
}
.ts-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-hi);
  flex-wrap: wrap;
}
.ts-count {
  font-size: 0.76rem;
  color: var(--text-dim, #8b8fa3);
  font-weight: 600;
}
.ts-verdict {
  font-size: 0.78rem;
  font-weight: 600;
}
.ts-verdict.pass {
  color: #34d399;
}
.ts-verdict.fail {
  color: #f87171;
}
.ts-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.btn-cancel {
  background: none;
  border: 1px solid var(--border-hi);
  color: var(--text-dim, #c9cbe0);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 0.8rem;
  cursor: pointer;
}
.btn-send-now {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--accent, #6366f1);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-send-now:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
