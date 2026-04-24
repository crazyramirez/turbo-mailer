<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from "vue";
import { Monitor, Smartphone, Sun, Moon } from "lucide-vue-next";

const props = defineProps<{ html: string; subject?: string }>();

const viewMode = ref<"desktop" | "mobile">("desktop");
const darkMode = ref(false);
const isMorphing = ref(false);
const frame = ref<HTMLIFrameElement | null>(null);

const darkStyles = `
  body { transition: filter .5s ease; }
  .dark-sim { filter: invert(100%) hue-rotate(180deg) !important; }
  .dark-sim img, .dark-sim [data-toggle="button"] { filter: invert(100%) hue-rotate(180deg) !important; }
  .dark-sim a:not([data-toggle="button"]) { color: #8ab4f8 !important; }
`;

function render() {
  const doc =
    frame.value?.contentDocument || frame.value?.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<style>
    html,body{background:#fff;overflow-x:hidden;margin:0;word-break:break-word;scrollbar-width:none;}
    html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}
    img{max-width:100%!important;height:auto!important;}
    a, button { cursor: default !important; }
    ${darkStyles}
  </style>${props.html}`);
  doc.close();
  if (darkMode.value) doc.body?.classList.add("dark-sim");

  // Prevent navigation and button clicks while allowing scroll
  doc.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}

watch(
  () => props.html,
  async () => {
    await nextTick();
    render();
  },
  { immediate: true },
);

watch(darkMode, (val) => {
  const doc =
    frame.value?.contentDocument || frame.value?.contentWindow?.document;
  if (doc?.body)
    val
      ? doc.body.classList.add("dark-sim")
      : doc.body.classList.remove("dark-sim");
});

watch(viewMode, () => {
  isMorphing.value = true;
  setTimeout(() => (isMorphing.value = false), 500);
});

onMounted(() => {
  if (props.html) render();
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
      </div>
    </div>

    <div v-if="html" class="cp-viewport scroll-hide">
      <div class="cp-canvas" :class="[viewMode, { morphing: isMorphing }]">
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

.cp-viewport {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
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
    opacity 0.4s;
  transform-origin: top center;
}
.cp-canvas.desktop {
  width: 100%;
  max-width: 820px;
  height: calc(100vh - 380px);
}
.cp-canvas.mobile {
  width: 360px;
  height: 720px;
  margin: 10px auto;
  position: relative;
  overflow: visible;
  animation: bounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
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
  transform: scale(0.97) translateY(4px);
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
  from {
    transform: translateX(-100%) skewX(-25deg);
  }
  to {
    transform: translateX(200%) skewX(-25deg);
  }
}
@keyframes bounce {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(0.96) translateY(8px);
  }
  100% {
    transform: scale(1) translateY(0);
  }
}

.cp-host {
  width: 100%;
  height: 100%;
  position: relative;
  background: #fff;
  /* padding: 16px; */
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
  .cp-viewport {
    padding: 16px;
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
  .cp-canvas.mobile {
    width: min(340px, calc(100vw - 44px));
    height: 660px;
  }
}
</style>
