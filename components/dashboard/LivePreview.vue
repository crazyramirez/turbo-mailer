<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { nextTick } from "vue";
import {
  Zap,
  Monitor,
  Smartphone,
  Sun,
  Moon,
  Copy,
  Check,
} from "lucide-vue-next";

const {
  htmlBody,
  contactRows,
  personalizedPreviewHtml,
  subjectPreview,
  emailSubject,
  copied,
  showToast,
} = useDashboardState();

// Share state with the editor system for consistency
const { viewMode, darkModePreview, isMorphing } = useEditorState();

const previewIframe = ref<HTMLIFrameElement | null>(null);

// Simulation styles for dark mode (from editor engine)
const darkModeSimulationStyles = `
  body { transition: filter 0.5s ease, background-color 0.5s ease; }
  .dark-mode-simulation {
    filter: invert(100%) hue-rotate(180deg) !important;
  }
  .dark-mode-simulation img,
  .dark-mode-simulation [data-toggle="button"],
  .dark-mode-simulation .visor-drag-handle {
    filter: invert(100%) hue-rotate(180deg) !important;
  }
  .dark-mode-simulation a:not([data-toggle="button"]) { color: #8ab4f8 !important; }
`;

function updateIframeContent() {
  const iframe = previewIframe.value;
  if (!iframe) return;
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(
      `<style>
        html, body { 
          overflow-x: hidden !important; 
          margin: 0; 
          word-break: break-word; 
          -ms-overflow-style: none; 
          scrollbar-width: none; 
        } 
        html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }
        img { max-width: 100% !important; height: auto !important; }
        a, button { cursor: default !important; }
        ${darkModeSimulationStyles}
      </style>` + personalizedPreviewHtml.value,
    );
    doc.close();

    // Apply dark mode if active
    if (darkModePreview.value) {
      doc.body.classList.add("dark-mode-simulation");
    }

    // Prevent navigation and clicks while allowing scroll
    doc.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  }
}

// Update iframe whenever personalized HTML changes
watch(
  personalizedPreviewHtml,
  async () => {
    await nextTick();
    updateIframeContent();
  },
  { immediate: true },
);

// Watch for dark mode changes to apply/remove class without reloading iframe
watch(darkModePreview, (isDark) => {
  const iframe = previewIframe.value;
  const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
  if (doc && doc.body) {
    if (isDark) doc.body.classList.add("dark-mode-simulation");
    else doc.body.classList.remove("dark-mode-simulation");
  }
});

// Watch view mode for morphing effect
watch(viewMode, () => {
  isMorphing.value = true;
  setTimeout(() => (isMorphing.value = false), 500);
});

async function copyHtml() {
  const iframe = previewIframe.value;
  if (!iframe) return;
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;

  try {
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    const titleEl = clone.querySelector("title");
    if (titleEl) titleEl.remove();

    const blobHtml = new Blob([clone.outerHTML], { type: "text/html" });
    const blobText = new Blob([doc.body.innerText], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText }),
    ]);

    copied.value = true;
    showToast("Diseño copiado al portapapeles", "success");
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Fallback: select + execCommand
    try {
      const win = iframe.contentWindow;
      if (win) {
        win.focus();
        const selection = win.getSelection();
        const range = doc.createRange();
        range.selectNodeContents(doc.body);
        selection?.removeAllRanges();
        selection?.addRange(range);
        doc.execCommand("copy");
        selection?.removeAllRanges();

        copied.value = true;
        showToast("Diseño copiado al portapapeles", "success");
        setTimeout(() => (copied.value = false), 2000);
      }
    } catch {
      showToast("Error al copiar diseño", "error");
    }
  }
}
</script>

<template>
  <div class="preview-side">
    <div class="sticky-preview-container">
      <div
        v-if="htmlBody"
        class="preview-window"
        :class="{ 'dark-mode-env': darkModePreview }"
      >
        <div class="preview-header-bar">
          <div class="preview-user-info">
            <div class="avatar-mini">
              <Zap :size="16" class="avatar-icon-pro" />
            </div>
            <div class="preview-titles">
              <span class="preview-label">Live Preview</span>
              <span class="preview-recipient-pill"
                >Para: {{ contactRows[0]?.email || "ejemplo@correo.com" }}</span
              >
            </div>
          </div>

          <div class="preview-controls-group">
            <div class="viewport-capsule">
              <button
                @click="viewMode = 'desktop'"
                :class="{ active: viewMode === 'desktop' }"
                class="v-pill"
                title="Vista Escritorio"
              >
                <Monitor :size="14" /> <span>Desktop</span>
              </button>
              <button
                @click="viewMode = 'mobile'"
                :class="{ active: viewMode === 'mobile' }"
                class="v-pill"
                title="Vista Móvil"
              >
                <Smartphone :size="14" /> <span>Mobile</span>
              </button>
            </div>

            <button
              @click="darkModePreview = !darkModePreview"
              class="btn-dark-mode"
              :class="{ active: darkModePreview }"
              :title="darkModePreview ? 'Modo Claro' : 'Modo Oscuro'"
            >
              <component :is="darkModePreview ? Sun : Moon" :size="14" />
              <span class="d-label">{{
                darkModePreview ? "Light" : "Dark"
              }}</span>
            </button>

            <div class="h-divider"></div>

            <button
              @click="copyHtml"
              class="btn-copy-preview"
              title="Copiar HTML"
            >
              <Copy :size="14" v-if="!copied" />
              <Check :size="14" v-else />
              <span>{{ copied ? "¡Copiado!" : "Copiar HTML" }}</span>
            </button>
          </div>
        </div>

        <div class="preview-email-meta">
          <div class="meta-row">
            <span class="meta-label">Asunto:</span>
            <span class="meta-value">{{
              subjectPreview || emailSubject || "(Sin asunto)"
            }}</span>
          </div>
        </div>

        <div class="preview-viewport scroll-hide">
          <div
            class="p-canvas-box"
            :class="[viewMode, { morphing: isMorphing }]"
          >
            <div class="p-iframe-host">
              <!-- Mobile frame decoration -->
              <div v-if="viewMode === 'mobile'" class="p-mobile-mockup-frame">
                <div class="p-frame-top"><div class="p-notch"></div></div>
                <div class="p-frame-bottom"><div class="p-home-bar"></div></div>
              </div>

              <iframe
                ref="previewIframe"
                class="preview-frame"
                sandbox="allow-same-origin"
              ></iframe>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-preview-state">
        <div class="preview-placeholder-art">
          <Monitor :size="40" stroke-width="1.5" />
        </div>
        <h3>Esperando Diseño</h3>
        <p>
          Carga una plantilla HTML para ver la personalización en tiempo real
          aquí.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-controls-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.viewport-capsule {
  background: rgba(0, 0, 0, 0.2);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--border);
  display: flex;
  gap: 4px;
}

.v-pill {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 6px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.v-pill span {
  font-size: 11px;
}

.v-pill.active {
  background: var(--bg-card);
  color: #fff;
}

.btn-dark-mode {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  height: 34px;
}

.btn-dark-mode:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.btn-dark-mode.active {
  background: #facc15;
  color: #000;
  border-color: #facc15;
  box-shadow: 0 0 15px rgba(250, 204, 21, 0.3);
}

.btn-dark-mode .d-label {
  width: 32px;
  text-align: left;
}

.h-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
}

.preview-viewport {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 20px;
  background: transparent;
  overflow-y: auto;
  position: relative;
  transition: background-color 0.5s ease;
}

.p-canvas-box {
  /* background: #fff; */
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.15);
  transition:
    width 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
    height 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.4s ease,
    opacity 0.4s ease;
  transform-origin: top center;
}

.p-canvas-box.desktop {
  width: 100%;
  max-width: 820px;
  height: 700px;
}

.p-canvas-box.mobile {
  width: 360px;
  height: 680px;
  margin: 10px auto;
  position: relative;
  overflow: visible;
  animation: viewport-bounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.p-canvas-box.morphing {
  filter: blur(4px);
  opacity: 0.9;
  transform: scale(0.97) translateY(5px);
}

/* 🌀 Futuristic Light Sweep during Morph */
.p-canvas-box.morphing::after {
  content: "";
  position: absolute;
  inset: -20px;
  background: linear-gradient(
    135deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  z-index: 50;
  pointer-events: none;
  animation: light-sweep 0.6s ease-in-out forwards;
}

@keyframes light-sweep {
  from {
    transform: translateX(-100%) skewX(-25deg);
  }
  to {
    transform: translateX(200%) skewX(-25deg);
  }
}

@keyframes viewport-bounce {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(0.96) translateY(10px);
  }
  100% {
    transform: scale(1) translateY(0);
  }
}

.p-iframe-host {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: #fff;
  transition: background-color 0.4s ease;
  padding: 20px;
  border-radius: 20px;
}

.dark-mode-env .p-iframe-host {
  background-color: #000000 !important;
}

/* Mobile Mockup Styles */
.p-mobile-mockup-frame {
  position: absolute;
  inset: -14px;
  border: 14px solid #0f172a;
  border-radius: 46px;
  pointer-events: none;
  z-index: 10;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.15),
    /* Clear Rim (Ribete Claro) */ inset 0 0 0 1px rgba(255, 255, 255, 0.05),
    0 30px 60px -12px rgba(0, 0, 0, 0.6);
}

.p-frame-top {
  position: absolute;
  top: 0; /* Adjusted for better alignment */
  left: 0;
  right: 0;
  height: 30px;
  display: flex;
  justify-content: center;
}

.p-frame-top .p-notch {
  width: 120px;
  height: 22px;
  background: #0f172a;
  border-radius: 0 0 14px 14px;
  box-shadow: inset 0 -1px 1px rgba(255, 255, 255, 0.1);
}

.p-frame-bottom {
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.p-frame-bottom .p-home-bar {
  width: 100px;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  margin-bottom: 8px;
}

.preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.scroll-hide::-webkit-scrollbar {
  display: none;
}
.scroll-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Responsive adjustments for the controls */
@media (max-width: 1200px) {
  .v-pill span,
  .btn-dark-mode .d-label {
    display: none;
  }
  .v-pill,
  .btn-dark-mode {
    padding: 0;
    width: 34px;
  }
}
</style>
