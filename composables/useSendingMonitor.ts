import { ref, computed } from 'vue'

interface CampaignProgress {
  name: string
  status: string
  sent: number
  total: number
  fail: number
}

// Module-level singleton — survives page navigation
const activeCampaignId = ref<number | null>(null)
const progress = ref<CampaignProgress | null>(null)
const visible = ref(false)
const completing = ref(false)
let pollInterval: ReturnType<typeof setInterval> | null = null
let completionTimer: ReturnType<typeof setTimeout> | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null

async function fetchProgress(id: number) {
  try {
    const data = await $fetch<CampaignProgress>(`/api/campaigns/${id}/progress`)
    progress.value = data

    if (data.status === 'sent' && !completing.value) {
      completing.value = true
      stopPolling()
      completionTimer = setTimeout(() => {
        visible.value = false
        completing.value = false
        activeCampaignId.value = null
      }, 4000)
    } else if (data.status === 'paused') {
      stopPolling()
      // Processor may still be writing final stats — one authoritative re-fetch
      if (!settleTimer) {
        settleTimer = setTimeout(async () => {
          settleTimer = null
          await fetchProgress(id)
        }, 1500)
      }
    } else if (data.status !== 'sending') {
      stopPolling()
    }
  } catch {
    // Silently ignore polling errors
  }
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

function startMonitoring(id: number) {
  if (completionTimer) {
    clearTimeout(completionTimer)
    completionTimer = null
  }
  completing.value = false
  activeCampaignId.value = id
  progress.value = null
  visible.value = true
  stopPolling()
  fetchProgress(id)
  pollInterval = setInterval(() => fetchProgress(id), 2000)
}

async function cancelSend() {
  if (!activeCampaignId.value) return
  try {
    await $fetch(`/api/campaigns/${activeCampaignId.value}/pause`, { method: 'POST' })
    await fetchProgress(activeCampaignId.value)
    stopPolling()
  } catch {}
}

async function resumeSend() {
  if (!activeCampaignId.value) return
  try {
    await $fetch(`/api/campaigns/${activeCampaignId.value}/send`, { method: 'POST' })
    await fetchProgress(activeCampaignId.value)
    completing.value = false
    stopPolling()
    pollInterval = setInterval(() => fetchProgress(activeCampaignId.value!), 2000)
  } catch {}
}

function dismiss() {
  stopPolling()
  visible.value = false
  completing.value = false
  if (completionTimer) {
    clearTimeout(completionTimer)
    completionTimer = null
  }
}

const isActive = computed(() => progress.value?.status === 'sending')
const isDone = computed(() => progress.value?.status === 'sent')
const isPaused = computed(() => progress.value?.status === 'paused')
const progressPct = computed(() => {
  const p = progress.value
  if (!p?.total) return 0
  return Math.min(100, Math.round(((p.sent + p.fail) / p.total) * 100))
})

export function useSendingMonitor() {
  return {
    activeCampaignId,
    progress,
    visible,
    completing,
    isActive,
    isDone,
    isPaused,
    progressPct,
    startMonitoring,
    cancelSend,
    resumeSend,
    dismiss,
  }
}
