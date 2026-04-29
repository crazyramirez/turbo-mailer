<script setup lang="ts">
import { useSendingMonitor } from '~/composables/useSendingMonitor'

const { visible, progress, isActive, isDone, isPaused, progressPct, completing, cancelSend, resumeSend, dismiss } = useSendingMonitor()
</script>

<template>
  <Transition name="badge-slide">
    <div v-if="visible && progress" class="sending-badge">
      <!-- Header row -->
      <div class="badge-header">
        <div class="badge-title-row">
          <span v-if="isActive" class="badge-dot sending" />
          <span v-else-if="isDone" class="badge-dot done" />
          <span v-else-if="isPaused" class="badge-dot paused" />
          <span class="badge-name">{{ progress.name }}</span>
        </div>
        <button class="badge-close" @click="dismiss" :aria-label="$t('sending_badge.dismiss')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Status text -->
      <div class="badge-status">
        <template v-if="isActive">
          {{ $t('sending_badge.sending', { sent: progress.sent, total: progress.total }) }}
        </template>
        <template v-else-if="isDone">
          {{ $t('sending_badge.completed', { sent: progress.sent }) }}
        </template>
        <template v-else-if="isPaused">
          {{ $t('sending_badge.paused', { sent: progress.sent, total: progress.total }) }}
        </template>
      </div>

      <!-- Progress bar -->
      <div class="badge-bar-track">
        <div
          class="badge-bar-fill"
          :class="{ done: isDone, paused: isPaused }"
          :style="{ width: progressPct + '%' }"
        />
      </div>

      <!-- Counts + action -->
      <div class="badge-footer">
        <span class="badge-counts">
          <span class="count-sent">{{ progress.sent }}</span>
          <span class="count-sep">/</span>
          <span class="count-total">{{ progress.total }}</span>
          <template v-if="progress.fail > 0">
            <span class="count-fail"> · {{ progress.fail }} {{ $t('sending_badge.failed') }}</span>
          </template>
        </span>
        <button
          v-if="isActive"
          class="badge-cancel"
          @click="cancelSend"
        >
          {{ $t('sending_badge.cancel') }}
        </button>
        <button
          v-if="isPaused"
          class="badge-resume"
          @click="resumeSend"
        >
          {{ $t('sending_badge.resume') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sending-badge {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 8500;
  width: 280px;
  background: #0d0f1a;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 16px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(99, 102, 241, 0.1),
    0 0 40px rgba(99, 102, 241, 0.06);
}

.badge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.badge-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.badge-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.badge-dot.sending {
  background: #6366f1;
  box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6);
  animation: pulse-dot 1.4s ease-in-out infinite;
}

.badge-dot.done {
  background: #22c55e;
}

.badge-dot.paused {
  background: #f59e0b;
}

.badge-name {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: color 0.15s;
}

.badge-close:hover {
  color: #fff;
}

.badge-status {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  line-height: 1.4;
}

.badge-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.badge-bar-fill {
  height: 100%;
  background: #6366f1;
  border-radius: 2px;
  transition: width 0.6s cubic-bezier(0.25, 1, 0.5, 1);
}

.badge-bar-fill.done {
  background: #22c55e;
}

.badge-bar-fill.paused {
  background: #f59e0b;
}

.badge-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.badge-counts {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  font-variant-numeric: tabular-nums;
}

.count-sent {
  color: #fff;
  font-weight: 600;
}

.count-sep {
  margin: 0 2px;
  color: rgba(255,255,255,0.25);
}

.count-fail {
  color: #f87171;
}

.badge-cancel {
  font-size: 11px;
  font-weight: 600;
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.badge-cancel:hover {
  background: rgba(248, 113, 113, 0.2);
  border-color: rgba(248, 113, 113, 0.4);
}

.badge-resume {
  font-size: 11px;
  font-weight: 600;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.badge-resume:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.45);
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6); }
  50% { box-shadow: 0 0 0 5px rgba(99, 102, 241, 0); }
}

/* Slide-up entrance */
.badge-slide-enter-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.badge-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.badge-slide-enter-from {
  opacity: 0;
  transform: translateY(16px);
}
.badge-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
