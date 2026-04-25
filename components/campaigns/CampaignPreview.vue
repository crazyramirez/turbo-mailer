<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { Monitor, Smartphone, Sun, Moon, Maximize2, X, Wifi, Battery } from "lucide-vue-next";

const props = defineProps<{ html: string; subject?: string }>();

const viewMode = ref<"desktop" | "mobile">("desktop");
const darkMode = ref(false);
const isMorphing = ref(false);
const isFullscreen = ref(false);
const frame = ref<HTMLIFrameElement | null>(null);
const fsFrame = ref<HTMLIFrameElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const mobileScale = ref(1);

function updateScale() {
  if (!viewport.value || viewMode.value !== "mobile") {
    mobileScale.value = 1;
    return;
  }
  const padding = 28;
  const availW = viewport.value.clientWidth - padding;
  const availH = viewport.value.clientHeight - padding * 1.5;
  mobileScale.value = Math.min(availW / 360, availH / 720, 1);
}

let observer: ResizeObserver | null = null;

const darkStyles = `
  body { transition: filter .5s ease; }
  .dark-sim { filter: invert(100%) hue-rotate(180deg) !important; }
  .dark-sim img, .dark-sim [data-toggle="button"] { filter: invert(100%) hue-rotate(180deg) !important; }
  .dark-sim a:not([data-toggle="button"]) { color: #8ab4f8 !important; }
`;

function renderInto(targetFrame: HTMLIFrameElement | null) {
  const doc = targetFrame?.contentDocument || targetFrame?.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<style>
    html,body{background:#fff;overflow-x:hidden;margin:0;word-break:break-word;scrollbar-width:none;}
    html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}
    img{max-width:100%!important;height:auto!important;}
    a,button{cursor:default!important;}
    ${darkStyles}
  </style>${props.html}`);
  doc.close();
  if (darkMode.value) doc.body?.classList.add("dark-sim");
  doc.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
}

function render() {
  renderInto(frame.value);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && isFullscreen.value) isFullscreen.value = false;
}

watch(
  () => props.html,
  async () => {
    await nextTick();
    render();
    if (isFullscreen.value) renderInto(fsFrame.value);
  },
  { immediate: true },
);

watch(darkMode, (val) => {
  [frame.value, isFullscreen.value ? fsFrame.value : null].forEach((f) => {
    const doc = f?.contentDocument || f?.contentWindow?.document;
    if (doc?.body) val ? doc.body.classList.add("dark-sim") : doc.body.classList.remove("dark-sim");
  });
});

watch(viewMode, () => {
  isMorphing.value = true;
  setTimeout(() => (isMorphing.value = false), 500);
  nextTick(updateScale);
});

watch(isFullscreen, async (val) => {
  if (val) {
    document.body.style.overflow = "hidden";
    await nextTick();
    renderInto(fsFrame.value);
  } else {
    document.body.style.overflow = "";
  }
});

onMounted(() => {
  if (props.html) render();
  document.addEventListener("keydown", onKeydown);
  if (import.meta.client && viewport.value) {
    observer = new ResizeObserver(updateScale);
    observer.observe(viewport.value);
    updateScale();
  }
});

onUnmounted(() => {
  observer?.disconnect();
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="cp-root" :class="{ 'dark-env': darkMode }">
    <div class="cp-toolbar">
      <div class="cp-meta">
        <span class="cp-label">Preview</span>
        <span v-if="subject" class="cp-subject">{{ subject }}</span>
      </div>
      <div class="cp-controls">
        <div class="vp-capsule">
          <button
            @click="viewMode = 'desktop'"
            :class="{ active: viewMode === 'desktop' }"
            class="v-pill"
          >
            <Monitor :size="13" /><span>Desktop</span>
          </button>
          <button
            @click="viewMode = 'mobile'"
            :class="{ active: viewMode === 'mobile' }"
            class="v-pill"
          >
            <Smartphone :size="13" /><span>Mobile</span>
          </button>
        </div>
        <button
          @click="darkMode = !darkMode"
          class="btn-theme"
          :class="{ active: darkMode }"
        >
          <component :is="darkMode ? Sun : Moon" :size="13" />
          <span>{{ darkMode ? "Light" : "Dark" }}</span>
        </button>
        <button
          @click="isFullscreen = true"
          class="btn-fs"
          :disabled="!html"
          title="Fullscreen"
        >
          <Maximize2 :size="14" />
        </button>
      </div>
    </div>

    <div v-if="html" ref="viewport" class="cp-viewport scroll-hide">
      <div
        class="cp-canvas"
        :class="[viewMode, { morphing: isMorphing }]"
        :style="
          viewMode === 'mobile' ? { transform: `scale(${mobileScale})` } : {}
        "
      >
        <div class="cp-host">
          <div v-if="viewMode === 'mobile'" class="phone-frame">
            <div class="phone-top"><div class="phone-notch"></div></div>
            <div class="phone-bottom"><div class="phone-bar"></div></div>
          </div>
          <iframe
            ref="frame"
            class="cp-frame"
            sandbox="allow-same-origin"
          ></iframe>
        </div>
      </div>
    </div>

    <div v-else class="cp-empty">
      <Monitor :size="44" stroke-width="1.2" />
      <p>Sin plantilla</p>
      <span>Importa o elige una plantilla de la biblioteca</span>
    </div>
  </div>

  <!-- Fullscreen overlay — teleported to body so it escapes any overflow clipping -->
  <Teleport to="body">
    <Transition name="fs">
      <div v-if="isFullscreen" class="fs-overlay">

        <!-- Desktop browser chrome -->
        <div v-if="viewMode === 'desktop'" class="fs-chrome fs-chrome--desktop">
          <div class="chrome-dots">
            <button class="dot dot-red" @click="isFullscreen = false" aria-label="Close fullscreen">
              <X :size="7" class="dot-icon" />
            </button>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <div class="chrome-urlbar">
            <svg class="url-lock" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span class="url-text">{{ subject || "email-preview.html" }}</span>
          </div>
          <div class="chrome-actions">
            <button class="chrome-btn" @click="viewMode = 'mobile'" title="Switch to mobile">
              <Smartphone :size="13" />
            </button>
            <button
              class="chrome-btn"
              :class="{ 'chrome-btn--lit': darkMode }"
              @click="darkMode = !darkMode"
              title="Toggle dark mode"
            >
              <component :is="darkMode ? Sun : Moon" :size="13" />
            </button>
            <button class="chrome-btn chrome-btn--esc" @click="isFullscreen = false" title="Exit fullscreen (Esc)">
              <span class="esc-label">ESC</span>
            </button>
          </div>
        </div>

        <!-- Mobile browser chrome -->
        <div v-else class="fs-chrome fs-chrome--mobile">
          <div class="mobile-statusbar">
            <span class="m-time">9:41</span>
            <div class="m-icons">
              <Wifi :size="11" />
              <Battery :size="11" />
            </div>
          </div>
          <div class="mobile-nav">
            <div class="mobile-urlbar">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>{{ subject || "email preview" }}</span>
            </div>
            <div class="mobile-btns">
              <button class="chrome-btn" @click="viewMode = 'desktop'" title="Switch to desktop">
                <Monitor :size="13" />
              </button>
              <button
                class="chrome-btn"
                :class="{ 'chrome-btn--lit': darkMode }"
                @click="darkMode = !darkMode"
              >
                <component :is="darkMode ? Sun : Moon" :size="13" />
              </button>
              <button class="chrome-btn chrome-btn--esc" @click="isFullscreen = false">
                <span class="esc-label">ESC</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="fs-body" :class="[viewMode, { 'fs-dark': darkMode }]">
          <iframe ref="fsFrame" class="fs-frame" :class="viewMode" sandbox="allow-same-origin"></iframe>
        </div>

      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 20px;
  background: rgb(0 0 0 / 3%);
  border: 1px solid var(--border);
  overflow: hidden;
}

.cp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.cp-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.cp-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}
.cp-subject {
  font-size: 12px;
  color: var(--text-muted);
  background: rgb(0 0 0 / 12%);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}
.cp-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.vp-capsule {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgb(0 0 0 / 15%);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.v-pill {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 6px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.v-pill.active {
  background: var(--bg-card, #16182a);
  color: #fff;
}
.v-pill span {
  font-size: 11px;
}
.btn-theme {
  background: rgb(255 255 255 / 5%);
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  height: 34px;
  white-space: nowrap;
}
.btn-theme:hover {
  background: rgb(255 255 255 / 10%);
  color: #fff;
}
.btn-theme.active {
  background: #facc15;
  color: #000;
  border-color: #facc15;
  box-shadow: 0 0 15px rgba(250, 204, 21, 0.3);
}

/* ── Fullscreen trigger button ── */
.btn-fs {
  background: rgb(255 255 255 / 5%);
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.btn-fs:hover:not(:disabled) {
  background: rgb(255 255 255 / 12%);
  color: #fff;
  transform: scale(1.06);
}
.btn-fs:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.cp-viewport {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 24px;
  overflow-y: hidden;
}
.scroll-hide::-webkit-scrollbar {
  display: none;
}
.scroll-hide {
  scrollbar-width: none;
}

.cp-canvas {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
  transition:
    width 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
    height 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.4s,
    opacity 0.4s,
    transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: top center;
}
.cp-canvas.desktop {
  width: 100%;
  max-width: 820px;
  height: calc(100vh - 380px);
  transform: scale(1);
}
.cp-canvas.mobile {
  width: 360px;
  height: 720px;
  margin: 10px auto;
  position: relative;
  overflow: visible;
}

@media (max-width: 768px) {
  .cp-canvas.mobile {
    width: 320px;
    height: 640px;
  }
}

.cp-canvas.morphing {
  filter: blur(4px);
  opacity: 0.9;
}
.cp-canvas.morphing::after {
  content: "";
  position: absolute;
  inset: -20px;
  background: linear-gradient(
    135deg,
    transparent 0%,
    rgba(255, 255, 255, 0.2) 50%,
    transparent 100%
  );
  z-index: 50;
  pointer-events: none;
  animation: sweep 0.6s ease-in-out forwards;
}
@keyframes sweep {
  from { transform: translateX(-100%) skewX(-25deg); }
  to   { transform: translateX(200%) skewX(-25deg); }
}
@keyframes bounce {
  0%   { transform: scale(1); }
  30%  { transform: scale(0.96) translateY(8px); }
  100% { transform: scale(1) translateY(0); }
}

.cp-host {
  width: 100%;
  height: 100%;
  position: relative;
  background: #fff;
  border-radius: 16px;
}
.dark-env .cp-host {
  background: #000 !important;
}
.phone-frame {
  position: absolute;
  inset: -14px;
  border: 14px solid #0f172a;
  border-radius: 46px;
  pointer-events: none;
  z-index: 10;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.15),
    inset 0 0 0 1px rgba(255, 255, 255, 0.05),
    0 30px 60px -12px rgba(0, 0, 0, 0.6);
}
.phone-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 30px;
  display: flex;
  justify-content: center;
}
.phone-notch {
  width: 120px;
  height: 22px;
  background: #0f172a;
  border-radius: 0 0 14px 14px;
}
.phone-bottom {
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}
.phone-bar {
  width: 100px;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  margin-bottom: 8px;
}
.cp-frame {
  width: 100%;
  height: 100%;
  min-height: 500px;
  border: none;
  display: block;
}

.cp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-dim);
  padding: 48px;
  text-align: center;
}
.cp-empty p {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-muted);
  margin: 0;
}
.cp-empty span {
  font-size: 13px;
  color: var(--text-dim);
}

/* ── Fullscreen overlay ──────────────────────────────────────── */

.fs-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: #000;
}

/* Enter/leave transitions */
.fs-enter-active {
  transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.34, 1.1, 0.64, 1);
}
.fs-leave-active {
  transition: opacity 0.18s ease, transform 0.2s ease-in;
}
.fs-enter-from,
.fs-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

/* ── Shared chrome base ── */
.fs-chrome {
  flex-shrink: 0;
  background: #1c1c1e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

/* Shared action button used in both chromes */
.chrome-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.55);
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.18s;
  flex-shrink: 0;
}
.chrome-btn:hover {
  background: rgba(255, 255, 255, 0.11);
  color: #fff;
}
.chrome-btn--lit {
  background: rgba(250, 204, 21, 0.12);
  border-color: rgba(250, 204, 21, 0.28);
  color: #facc15;
}
.chrome-btn--esc {
  width: auto;
  padding: 0 9px;
  background: rgba(255, 95, 87, 0.1);
  border-color: rgba(255, 95, 87, 0.22);
}
.chrome-btn--esc:hover {
  background: rgba(255, 95, 87, 0.22);
  color: #ff5f57;
}
.esc-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.09em;
  color: #ff5f57;
  text-transform: uppercase;
}

/* ── Desktop chrome ── */
.fs-chrome--desktop {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  height: 48px;
}
.chrome-dots {
  display: flex;
  gap: 7px;
  align-items: center;
  flex-shrink: 0;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
button.dot {
  border: none;
  cursor: pointer;
  padding: 0;
  transition: filter 0.15s;
}
button.dot:hover { filter: brightness(0.85); }
.dot-red    { background: #ff5f57; }
.dot-yellow { background: #febc2e; }
.dot-green  { background: #28c840; }
.dot-icon   { opacity: 0; transition: opacity 0.15s; color: rgba(0, 0, 0, 0.55); }
.dot-red:hover .dot-icon { opacity: 1; }

.chrome-urlbar {
  flex: 1;
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 9px;
  padding: 7px 14px;
  overflow: hidden;
}
.url-lock {
  color: rgba(255, 255, 255, 0.32);
  flex-shrink: 0;
}
.url-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chrome-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

/* ── Mobile chrome ── */
.mobile-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 24px 3px;
}
.m-time {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: -0.01em;
}
.m-icons {
  display: flex;
  gap: 5px;
  align-items: center;
  color: rgba(255, 255, 255, 0.7);
}
.mobile-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 10px;
}
.mobile-urlbar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 8px 13px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.38);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-urlbar svg { flex-shrink: 0; }
.mobile-btns {
  display: flex;
  gap: 5px;
}

/* ── Fullscreen content area ── */
.fs-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}
.fs-body.desktop {
  background: #ebebeb;
  justify-content: center;
}
.fs-body.desktop.fs-dark {
  background: #111;
}
.fs-body.mobile {
  background: #1a1a1c;
  justify-content: center;
  align-items: flex-start;
}

.fs-frame {
  border: none;
  display: block;
}
.fs-frame.desktop {
  width: min(100%, 1280px);
  height: 100%;
}
.fs-frame.mobile {
  width: 375px;
  height: 100%;
  flex-shrink: 0;
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.6);
}

/* ── Responsive ──────────────────────────────────────────── */

@media (max-width: 768px) {
  .cp-toolbar {
    padding: 10px 12px;
    gap: 8px;
  }
  .cp-subject {
    max-width: 160px;
    font-size: 11px;
  }
  .v-pill span {
    display: none;
  }
  .v-pill {
    padding: 6px 10px;
  }
  .btn-theme span {
    display: none;
  }
  .btn-theme {
    padding: 0 10px;
    gap: 0;
  }
  .cp-canvas.desktop {
    height: calc(100vh - 340px);
    min-height: 300px;
  }
}

@media (max-width: 480px) {
  .cp-toolbar {
    padding: 8px 10px;
  }
  .cp-label {
    display: none;
  }
  .cp-subject {
    max-width: 130px;
  }
  .cp-controls {
    gap: 6px;
  }
  .cp-viewport {
    padding: 10px;
  }
  .cp-canvas.desktop {
    height: calc(100vh - 300px);
    min-height: 260px;
  }
}
</style>
