<script setup lang="ts">
import {
  X,
  Sparkles,
  Users,
  Mail,
  BarChart2,
  Plus,
  ArrowRight,
  Loader2,
  Check,
} from "lucide-vue-next";

const emit = defineEmits<{ close: []; done: [] }>();
const { t } = useI18n();
const { showToast } = useDashboardState();

const loading = ref(false);

async function loadDemo() {
  loading.value = true;
  try {
    await $fetch("/api/demo-load", { method: "POST" });
    emit("done");
    emit("close");
    window.location.reload();
  } catch {
    showToast(t("welcome_modal.error"), "error");
    loading.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="wm">
      <div
        class="wm-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="!loading && emit('close')"
      >
        <div class="wm-card">
          <!-- Orb decorations -->
          <div class="wm-orb wm-orb-1" />
          <div class="wm-orb wm-orb-2" />
          <div class="wm-orb wm-orb-3" />

          <!-- Close -->
          <button
            class="wm-close"
            :disabled="loading"
            aria-label="Close"
            @click="emit('close')"
          >
            <X :size="14" />
          </button>

          <!-- ── Hero ─────────────────────────────────────────── -->
          <div class="wm-hero">
            <div class="wm-hero-ring">
              <img
                src="/images/icons/web-app-manifest-192x192.png"
                alt="Turbo Mailer"
                class="wm-hero-logo"
              />
            </div>
            <div class="wm-hero-text">
              <h2>{{ t("welcome_modal.title") }}</h2>
              <p>{{ t("welcome_modal.subtitle") }}</p>
            </div>
          </div>

          <!-- ── Choice tiles ─────────────────────────────────── -->
          <div class="wm-tiles">
            <!-- Scratch tile — PRIMARY -->
            <div
              class="wm-tile wm-tile--scratch"
              :class="{ 'wm-tile--disabled': loading }"
            >
              <div class="wm-tile-head">
                <div class="wm-tile-icon wm-tile-icon--accent">
                  <Plus :size="15" />
                </div>
                <div>
                  <span class="wm-tile-title">{{
                    t("welcome_modal.scratch_title")
                  }}</span>
                  <span class="wm-tile-desc wm-tile-desc--inline">{{
                    t("welcome_modal.scratch_desc")
                  }}</span>
                </div>
              </div>
              <button
                class="wm-btn-primary"
                :disabled="loading"
                @click="emit('close')"
              >
                <span class="wm-btn-shimmer" />
                <Plus :size="14" />
                {{ t("welcome_modal.btn_scratch") }}
                <ArrowRight :size="14" class="wm-arrow" />
              </button>
            </div>

            <!-- Demo tile — SECONDARY -->
            <div
              class="wm-tile wm-tile--demo"
              :class="{ 'wm-tile--loading': loading }"
            >
              <div class="wm-tile-head">
                <div class="wm-tile-icon wm-tile-icon--muted">
                  <Sparkles :size="15" />
                </div>
                <div class="wm-tile-title-group">
                  <span class="wm-tile-title">{{
                    t("welcome_modal.demo_title")
                  }}</span>
                  <span class="wm-tag">{{ t("welcome_modal.demo_tag") }}</span>
                </div>
              </div>

              <ul class="wm-checks">
                <li>
                  <span class="wm-check-icon"><Check :size="10" /></span>
                  {{ t("welcome_modal.feat_contacts") }}
                </li>
                <li>
                  <span class="wm-check-icon"><Check :size="10" /></span>
                  {{ t("welcome_modal.feat_campaigns") }}
                </li>
                <li>
                  <span class="wm-check-icon"><Check :size="10" /></span>
                  {{ t("welcome_modal.feat_analytics") }}
                </li>
              </ul>

              <button class="wm-btn-demo" :disabled="loading" @click="loadDemo">
                <Loader2 v-if="loading" :size="13" class="wm-spin" />
                <Sparkles v-else :size="13" />
                {{
                  loading
                    ? t("welcome_modal.loading")
                    : t("welcome_modal.btn_demo")
                }}
              </button>
            </div>
          </div>

          <!-- ── Footer note ──────────────────────────────────── -->
          <div class="wm-footer">
            <Sparkles :size="11" class="wm-footer-icon" />
            {{ t("welcome_modal.note") }}
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ──────────────────────────────────────────────── */
.wm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(6, 8, 15, 0.72);
  backdrop-filter: blur(10px);
}

/* ── Card ─────────────────────────────────────────────────── */
.wm-card {
  position: relative;
  width: 100%;
  max-width: 520px;
  background: linear-gradient(
    160deg,
    rgba(30, 27, 75, 0.6) 0%,
    rgba(26, 32, 48, 0.95) 45%
  );
  border: 1px solid rgba(99, 102, 241, 0.18);
  border-radius: 28px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 32px 80px rgba(0, 0, 0, 0.65),
    0 0 120px rgba(99, 102, 241, 0.08);
  display: flex;
  flex-direction: column;
}

/* ── Ambient orbs ─────────────────────────────────────────── */
.wm-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}
.wm-orb-1 {
  width: 260px;
  height: 260px;
  top: -80px;
  left: -60px;
  background: radial-gradient(
    circle,
    rgba(99, 102, 241, 0.18) 0%,
    transparent 65%
  );
  animation: orb-drift 8s ease-in-out infinite;
}
.wm-orb-2 {
  width: 180px;
  height: 180px;
  top: -40px;
  right: -20px;
  background: radial-gradient(
    circle,
    rgba(139, 92, 246, 0.14) 0%,
    transparent 65%
  );
  animation: orb-drift 10s ease-in-out infinite reverse;
}
.wm-orb-3 {
  width: 120px;
  height: 120px;
  bottom: 60px;
  right: 40px;
  background: radial-gradient(
    circle,
    rgba(56, 189, 248, 0.08) 0%,
    transparent 65%
  );
  animation: orb-drift 12s ease-in-out infinite 3s;
}

@keyframes orb-drift {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(8px, -12px) scale(1.05);
  }
  66% {
    transform: translate(-6px, 8px) scale(0.97);
  }
}

/* ── Close ────────────────────────────────────────────────── */
.wm-close {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 10;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;
}
.wm-close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.14);
  color: var(--text);
}
.wm-close:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* ── Hero ─────────────────────────────────────────────────── */
.wm-hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 52px 40px 32px;
  gap: 20px;
}

.wm-hero-ring {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow:
    0 0 0 4px rgba(99, 102, 241, 0.05),
    0 0 20px rgba(99, 102, 241, 0.2),
    0 0 40px rgba(99, 102, 241, 0.1);
  animation: icon-float 5s ease-in-out infinite;
}

.wm-hero-ring::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  padding: 1px;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.5),
    transparent,
    rgba(139, 92, 246, 0.5)
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.wm-hero-logo {
  width: 90px;
  height: 90px;
  object-fit: contain;
  filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.4));
  border-radius: 50%;
}

@keyframes icon-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.wm-hero-text h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--text);
  margin: 0 0 8px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.wm-hero-text p {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.65;
  max-width: 340px;
}

/* ── Tiles wrapper ────────────────────────────────────────── */
.wm-tiles {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 22px;
}

/* ── Tile base ────────────────────────────────────────────── */
.wm-tile {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.025);
  backdrop-filter: blur(8px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition:
    border-color 0.25s,
    background 0.25s,
    box-shadow 0.25s,
    transform 0.25s;
}

/* ── Scratch tile — PRIMARY ───────────────────────────────── */
.wm-tile--scratch {
  border-color: rgba(99, 102, 241, 0.22);
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.07) 0%,
    rgba(139, 92, 246, 0.04) 100%
  );
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.06) inset;
}
.wm-tile--scratch:not(.wm-tile--disabled):hover {
  border-color: rgba(99, 102, 241, 0.38);
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.1) 0%,
    rgba(139, 92, 246, 0.06) 100%
  );
  box-shadow:
    0 0 0 1px rgba(99, 102, 241, 0.1) inset,
    0 8px 32px rgba(99, 102, 241, 0.12);
  transform: translateY(-2px);
}
.wm-tile--disabled {
  opacity: 0.4;
  pointer-events: none;
}

/* ── Demo tile — SECONDARY ────────────────────────────────── */
.wm-tile--demo {
  background: rgba(255, 255, 255, 0.02);
}
.wm-tile--demo:not(.wm-tile--loading):hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  transform: translateY(-1px);
}

/* ── Tile head ────────────────────────────────────────────── */
.wm-tile-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wm-tile--scratch .wm-tile-head {
  flex: 1;
  align-items: flex-start;
}

/* ── Tile icons ───────────────────────────────────────────── */
.wm-tile-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wm-tile-icon--accent {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.22);
  color: #a5b4fc;
}
.wm-tile-icon--muted {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-dim);
}

/* ── Tile titles ──────────────────────────────────────────── */
.wm-tile-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.wm-tile-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.01em;
}

/* ── Recommended tag ──────────────────────────────────────── */
.wm-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.2),
    rgba(139, 92, 246, 0.15)
  );
  border: 1px solid rgba(99, 102, 241, 0.28);
  color: #c4b5fd;
}

/* ── Tile description ─────────────────────────────────────── */
.wm-tile-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.55;
  margin: 0;
}
.wm-tile-desc--inline {
  display: block;
  font-size: 12px;
  margin-top: 3px;
  color: var(--text-dim);
}

/* ── Feature checks ───────────────────────────────────────── */
.wm-checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wm-checks li {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--text-muted);
}
.wm-check-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
  flex-shrink: 0;
}

/* ── Primary button ───────────────────────────────────────── */
.wm-btn-primary {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 13px 20px;
  border-radius: 13px;
  border: none;
  background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: -0.01em;
  transition:
    filter 0.2s,
    transform 0.2s,
    box-shadow 0.2s;
  box-shadow:
    0 4px 20px rgba(99, 102, 241, 0.38),
    0 1px 0 rgba(255, 255, 255, 0.12) inset;
}
.wm-btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow:
    0 8px 28px rgba(99, 102, 241, 0.5),
    0 1px 0 rgba(255, 255, 255, 0.15) inset;
}
.wm-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* Shimmer on hover */
.wm-btn-shimmer {
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.12),
    transparent
  );
  transform: skewX(-20deg);
  transition: left 0.55s ease;
  pointer-events: none;
}
.wm-btn-primary:hover .wm-btn-shimmer {
  left: 160%;
}

/* Arrow nudge on hover */
.wm-arrow {
  transition: transform 0.2s;
}
.wm-btn-primary:hover .wm-arrow {
  transform: translateX(3px);
}

/* ── Demo button (secondary) ──────────────────────────────── */
.wm-btn-demo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px 16px;
  border-radius: 11px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    color 0.2s;
}
.wm-btn-demo:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  color: var(--text);
}
.wm-btn-demo:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Footer note ──────────────────────────────────────────── */
.wm-footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 16px 22px 24px;
  padding: 11px 16px;
  background: rgba(99, 102, 241, 0.04);
  border: 1px solid rgba(99, 102, 241, 0.1);
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.4;
}
.wm-footer-icon {
  flex-shrink: 0;
  color: #818cf8;
  opacity: 0.6;
}

/* ── Spinner ──────────────────────────────────────────────── */
.wm-spin {
  animation: wm-spin 0.7s linear infinite;
}
@keyframes wm-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Entrance / exit transition ───────────────────────────── */
.wm-enter-active {
  transition: opacity 0.3s ease;
}
.wm-leave-active {
  transition: opacity 0.2s ease;
}
.wm-enter-from,
.wm-leave-to {
  opacity: 0;
}

.wm-enter-active .wm-card {
  transition:
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease;
}
.wm-leave-active .wm-card {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}
.wm-enter-from .wm-card,
.wm-leave-to .wm-card {
  transform: scale(0.93) translateY(16px);
  opacity: 0;
}

/* ── Reduced motion ───────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .wm-orb-1,
  .wm-orb-2,
  .wm-orb-3,
  .wm-hero-ring,
  .wm-btn-shimmer {
    animation: none;
    transition: none;
  }
}

/* ── Mobile ───────────────────────────────────────────────── */
@media (max-width: 580px) {
  .wm-overlay {
    padding: 16px;
  }
  .wm-hero {
    padding: 44px 24px 26px;
  }
  .wm-hero-text h2 {
    font-size: 20px;
  }
  .wm-tiles {
    padding: 0 16px;
  }
  .wm-footer {
    margin: 14px 16px 20px;
  }
  .wm-tile--scratch {
    flex-direction: column;
    align-items: stretch;
  }
  .wm-btn-ghost {
    text-align: center;
    justify-content: center;
  }
}
</style>
