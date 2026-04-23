<script setup lang="ts">
import {
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  LayoutGrid,
  Upload,
  Send,
} from "lucide-vue-next";
import CampaignLibraryModal from "~/components/campaigns/CampaignLibraryModal.vue";
import CampaignPreview from "~/components/campaigns/CampaignPreview.vue";

definePageMeta({ layout: "app" });

const { t } = useI18n();
const router = useRouter();

const step = ref(1);
const lists = ref<any[]>([]);
const showLibrary = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const htmlDragging = ref(false);
const isSaving = ref(false);

const form = ref({
  name: "",
  subject: "",
  listId: null as number | null,
  templateName: "",
  templateHtml: "",
});

async function fetchLists() {
  lists.value = await $fetch<any[]>("/api/lists");
}

function applyTemplate(html: string, name: string) {
  form.value.templateHtml = html;
  form.value.templateName = name;
  showLibrary.value = false;
}

async function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const html = await file.text();
  applyTemplate(html, file.name.replace(".html", ""));
  (e.target as HTMLInputElement).value = "";
}

async function onDrop(e: DragEvent) {
  htmlDragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.name.endsWith(".html")) return;
  const html = await file.text();
  applyTemplate(html, file.name.replace(".html", ""));
}

function clearTemplate() {
  form.value.templateHtml = "";
  form.value.templateName = "";
}

function canNext() {
  if (step.value === 1)
    return form.value.name.trim() && form.value.subject.trim();
  if (step.value === 2) return true;
  if (step.value === 3) return !!form.value.templateHtml;
  return true;
}

async function save() {
  isSaving.value = true;
  try {
    const campaign = await $fetch<any>("/api/campaigns", {
      method: "POST",
      body: form.value,
    });
    // Artificial delay to show the premium overlay
    await new Promise((r) => setTimeout(r, 2000));
    router.push(`/campaigns/${campaign.id}`);
  } catch (err) {
    isSaving.value = false;
    console.error(err);
  }
}

onMounted(() => {
  fetchLists();
});
</script>

<template>
  <div class="page-layout">
    <main class="page-main">
      <div
        class="wizard-wrap"
        :class="{ 'wizard-wide': step === 3 && form.templateHtml }"
      >
        <!-- Steps indicator -->
        <div class="steps-nav">
          <div
            v-for="n in 4"
            :key="n"
            class="step-item"
            :class="{ done: step > n, active: step === n }"
          >
            <div class="step-node">
              <Check v-if="step > n" :size="14" stroke-width="3" />
              <span v-else>{{ n }}</span>
            </div>
            <span class="step-label">{{
              t(`campaigns_page.step${n}_title`)
            }}</span>
            <div v-if="n < 4" class="step-line" />
          </div>
        </div>

        <!-- Step 1: Name & Subject -->
        <div v-if="step === 1" class="step-panel">
          <h2>{{ t("campaigns_page.step1_title") }}</h2>
          <label
            >{{ t("campaigns_page.campaign_name") }}
            <input
              v-model="form.name"
              type="text"
              class="form-input"
              :placeholder="t('campaigns_page.campaign_name_ph')"
            />
          </label>
          <label
            >{{ t("step_subject.title") }}
            <input
              v-model="form.subject"
              type="text"
              class="form-input"
              :placeholder="t('step_subject.placeholder')"
            />
            <div class="var-chips">
              <button
                v-for="v in [
                  '{{Nombre}}',
                  '{{Empresa}}',
                  '{{URL}}',
                  '{{Linkedin}}',
                  '{{Instagram}}',
                  '{{Youtube}}',
                ]"
                :key="v"
                type="button"
                class="var-chip"
                @click="form.subject += v"
              >
                {{ v.replaceAll("{", "").replaceAll("}", "") }}
              </button>
            </div>
          </label>
        </div>

        <!-- Step 2: List -->
        <div v-if="step === 2" class="step-panel">
          <h2>{{ t("campaigns_page.step2_title") }}</h2>
          <div class="list-options">
            <div
              class="list-option"
              :class="{ active: form.listId === null }"
              @click="form.listId = null"
            >
              <div class="opt-dot" style="background: #4b5563" />
              <div>
                <strong>{{ t("campaigns_page.no_list") }}</strong>
                <p>Usa el Excel desde el dashboard</p>
              </div>
            </div>
            <div
              v-for="list in lists"
              :key="list.id"
              class="list-option"
              :class="{ active: form.listId === list.id }"
              @click="form.listId = list.id"
            >
              <div class="opt-dot" :style="{ background: list.color }" />
              <div>
                <strong>{{ list.name }}</strong>
                <p>{{ list.contactCount }} {{ t("contacts_page.contacts") }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Template -->
        <div v-if="step === 3" class="step-panel">
          <h2>{{ t("campaigns_page.step3_title") }}</h2>

          <!-- Loaded state with preview -->
          <div v-if="form.templateHtml" class="tpl-loaded-layout">
            <div class="tpl-loaded-left">
              <div class="tpl-loaded">
                <div class="tpl-loaded-icon">
                  <Check :size="20" stroke-width="3" />
                </div>
                <div class="tpl-loaded-meta">
                  <span class="tpl-loaded-name">{{ form.templateName }}</span>
                  <span class="tpl-loaded-sub">Plantilla HTML lista</span>
                </div>
                <button
                  class="tpl-clear"
                  @click="clearTemplate"
                  title="Cambiar plantilla"
                >
                  <X :size="16" />
                </button>
              </div>
              <div class="tpl-change-row">
                <button class="tpl-change-btn" @click="showLibrary = true">
                  <LayoutGrid :size="14" /> Cambiar desde biblioteca
                </button>
                <button class="tpl-change-btn" @click="fileInput?.click()">
                  <Upload :size="14" /> Importar otro HTML
                </button>
              </div>
            </div>
            <div class="tpl-loaded-preview">
              <CampaignPreview
                :html="form.templateHtml"
                :subject="form.subject"
              />
            </div>
          </div>

          <!-- Picker (no template yet) -->
          <div v-else class="tpl-picker">
            <button class="tpl-option biblioteca" @click="showLibrary = true">
              <div class="tpl-option-icon"><LayoutGrid :size="28" /></div>
              <div class="tpl-option-text">
                <span>Biblioteca</span>
                <p>Explorar diseños guardados</p>
              </div>
            </button>

            <div
              class="tpl-option dropzone"
              :class="{ dragging: htmlDragging }"
              @click="fileInput?.click()"
              @dragover.prevent="htmlDragging = true"
              @dragleave="htmlDragging = false"
              @drop.prevent="onDrop"
            >
              <div class="tpl-option-icon"><Upload :size="28" /></div>
              <div class="tpl-option-text">
                <span>Importar HTML</span>
                <p>Arrastra o haz clic para subir</p>
              </div>
            </div>
          </div>

          <input
            ref="fileInput"
            type="file"
            accept=".html"
            class="sr-only"
            @change="handleFile"
          />
        </div>

        <!-- Step 4: Review -->
        <div v-if="step === 4" class="step-panel">
          <h2>{{ t("campaigns_page.step4_title") }}</h2>
          <div class="review-grid">
            <div class="review-item">
              <span class="rev-label">Nombre</span>
              <span class="rev-val">{{ form.name }}</span>
            </div>
            <div class="review-item">
              <span class="rev-label">Asunto</span>
              <span class="rev-val">{{ form.subject }}</span>
            </div>
            <div class="review-item">
              <span class="rev-label">Lista</span>
              <span class="rev-val">{{
                form.listId
                  ? lists.find((l) => l.id === form.listId)?.name
                  : "Manual (Excel)"
              }}</span>
            </div>
            <div class="review-item">
              <span class="rev-label">Plantilla</span>
              <span class="rev-val">{{ form.templateName || "—" }}</span>
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <div class="wizard-nav">
          <button class="btn-secondary" @click="router.push('/campaigns')">
            <X :size="15" />Cancelar
          </button>
          <button v-if="step > 1" class="btn-secondary" @click="step--">
            <ChevronLeft :size="15" />{{ t("campaigns_page.back") }}
          </button>
          <div style="flex: 1" />
          <button
            v-if="step < 4"
            class="btn-primary"
            :disabled="!canNext()"
            @click="step++"
          >
            {{ t("campaigns_page.next") }}<ChevronRight :size="15" />
          </button>
          <button v-else class="btn-primary" @click="save">
            <Check :size="15" />{{ t("campaigns_page.save_draft") }}
          </button>
        </div>
      </div>
    </main>

    <!-- Library modal -->
    <Transition name="fade-scale">
      <CampaignLibraryModal
        v-if="showLibrary"
        @select="applyTemplate"
        @close="showLibrary = false"
      />
    </Transition>

    <!-- Saving / Processing Overlay -->
    <Transition name="premium-overlay">
      <div v-if="isSaving" class="saving-overlay">
        <div class="saving-glass">
          <div class="saving-icon-wrapper">
            <div class="saving-rings">
              <div class="ring r1"></div>
              <div class="ring r2"></div>
              <div class="ring r3"></div>
            </div>
            <div class="saving-icon">
              <Send :size="32" stroke-width="1.5" />
            </div>
          </div>
          <h2 class="saving-title">Procesando campaña</h2>
          <p class="saving-desc">
            Configurando enlaces y estructurando métricas...
          </p>
          <div class="saving-progress">
            <div class="saving-bar"></div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-layout {
  min-height: calc(100vh - 80px);
  color: var(--text);
  display: flex;
  flex-direction: column;
  margin: 0 40px;
}
.page-main {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 60px 24px;
}

.wizard-wrap {
  width: 100%;
  max-width: 620px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  transition: max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.wizard-wide {
  max-width: 1100px;
}

/* Steps */
.steps-nav {
  display: flex;
  align-items: center;
}
.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-node {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  border: 2px solid var(--border);
  color: var(--text-dim);
  background: transparent;
  flex-shrink: 0;
  transition: all 0.3s;
}
.step-item.active .step-node {
  border-color: var(--accent);
  color: var(--accent-light);
}
.step-item.done .step-node {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
.step-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  white-space: nowrap;
}
.step-item.active .step-label {
  color: var(--text);
}
.step-line {
  height: 1px;
  width: 40px;
  background: var(--border);
  margin: 0 8px;
}

/* Panel */
.step-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.step-panel h2 {
  font-size: 22px;
  font-weight: 800;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.form-input {
  padding: 11px 14px;
  background: rgb(0 0 0 / 3%);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  font-size: 14px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.form-input:focus {
  border-color: var(--accent);
}

/* Var chips */
.var-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
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
}

/* List options */
.list-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.list-option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgb(0 0 0 / 2%);
  cursor: pointer;
  transition: all 0.2s;
}
.list-option:hover {
  border-color: var(--border-hi, #2d3155);
  background: rgb(0 0 0 / 4%);
}
.list-option.active {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.08);
}
.opt-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.list-option strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  display: block;
}
.list-option p {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Template picker */
.tpl-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.tpl-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 20px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: rgb(0 0 0 / 2%);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
}
.tpl-option:hover {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.06);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.tpl-option.dragging {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.1);
  border-style: dashed;
}
.tpl-option-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tpl-option-text span {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  display: block;
}
.tpl-option-text p {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 3px;
}

/* Loaded state */
.tpl-loaded {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px solid rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.06);
}
.tpl-loaded-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tpl-loaded-meta {
  flex: 1;
}
.tpl-loaded-name {
  font-size: 15px;
  font-weight: 700;
  color: #10b981;
  display: block;
}
.tpl-loaded-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  display: block;
}
.tpl-clear {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.tpl-clear:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
}

/* Loaded + preview 2-col */
.tpl-loaded-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  align-items: start;
}
.tpl-loaded-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tpl-change-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tpl-change-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: rgb(0 0 0 / 5%);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.tpl-change-btn:hover {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.25);
  color: var(--accent-light);
}
.tpl-loaded-preview {
  height: 620px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

/* Review */
.review-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.review-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: rgb(0 0 0 / 2%);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.rev-label {
  font-size: 13px;
  color: var(--text-dim);
}
.rev-val {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

/* Nav */
.wizard-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
}
.btn-primary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 22px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 18px;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover {
  background: rgb(0 0 0 / 5%);
  color: var(--text);
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

/* ── Premium Saving Overlay ───────────────────────── */
.saving-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
}
.saving-glass {
  background: rgba(15, 17, 35, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(99, 102, 241, 0.1);
  border-radius: 28px;
  padding: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 90%;
  max-width: 380px;
  position: relative;
  overflow: hidden;
}
.saving-glass::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    to right,
    transparent,
    rgba(99, 102, 241, 0.1),
    transparent
  );
  animation: shine 2.5s infinite;
}
@keyframes shine {
  to {
    left: 200%;
  }
}
.saving-icon-wrapper {
  position: relative;
  width: 90px;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
}
.saving-icon {
  position: relative;
  z-index: 10;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4);
  animation: float-icon 3s ease-in-out infinite;
}
@keyframes float-icon {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
.saving-rings {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(99, 102, 241, 0.5);
  animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}
.r1 {
  width: 100%;
  height: 100%;
  animation-delay: 0s;
}
.r2 {
  width: 100%;
  height: 100%;
  animation-delay: 0.4s;
}
.r3 {
  width: 100%;
  height: 100%;
  animation-delay: 0.8s;
}
@keyframes pulse-ring {
  0% {
    transform: scale(0.7);
    opacity: 1;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}
.saving-title {
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  margin: 0 0 8px 0;
  letter-spacing: -0.01em;
}
.saving-desc {
  font-size: 14px;
  color: var(--text-dim);
  margin: 0 0 32px 0;
}
.saving-progress {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}
.saving-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, var(--accent), #38bdf8);
  border-radius: 10px;
  animation: progress-slide 1.2s ease-in-out infinite alternate;
}
@keyframes progress-slide {
  0% {
    left: 0%;
    width: 40%;
  }
  100% {
    left: 60%;
    width: 40%;
  }
}

.premium-overlay-enter-active,
.premium-overlay-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.premium-overlay-enter-from,
.premium-overlay-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}
.premium-overlay-enter-from .saving-glass,
.premium-overlay-leave-to .saving-glass {
  transform: scale(0.9) translateY(20px);
  opacity: 0;
}

/* ── Responsive ──────────────────────────────────────────── */

@media (max-width: 900px) {
  .page-layout {
    margin: 0 20px;
  }
  .page-main {
    padding: 40px 16px;
  }
  .tpl-loaded-layout {
    grid-template-columns: 240px 1fr;
  }
  .tpl-loaded-preview {
    height: 620px;
  }
}

@media (max-width: 768px) {
  .page-layout {
    margin: 0 16px;
  }
  .page-main {
    padding: 28px 12px;
  }
  .wizard-wide {
    max-width: 100%;
  }
  .steps-nav {
    gap: 0;
  }
  .step-label {
    display: none;
  }
  .step-line {
    width: 24px;
    margin: 0 4px;
  }
  .step-node {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }
  .tpl-picker {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .tpl-loaded-layout {
    grid-template-columns: 1fr;
  }
  .tpl-loaded-preview {
    height: 560px;
  }
  .wizard-nav {
    flex-wrap: wrap;
    gap: 10px;
  }
  .btn-primary,
  .btn-secondary {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
}

@media (max-width: 480px) {
  .page-layout {
    margin: 0 10px;
  }
  .page-main {
    padding: 20px 8px;
  }
  .wizard-wrap {
    gap: 24px;
  }
  .step-panel h2 {
    font-size: 18px;
  }
  .tpl-option {
    padding: 18px 16px;
    gap: 12px;
  }
  .tpl-option-icon {
    width: 40px;
    height: 40px;
  }
  .list-option {
    padding: 14px 16px;
    gap: 10px;
  }
  .review-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .wizard-nav {
    flex-direction: column;
  }
  .btn-primary,
  .btn-secondary {
    width: 100%;
  }
}
</style>
