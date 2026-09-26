import { useDashboardState } from '~/composables/useDashboardState'

// Session-level actions of the app header. Sending lives in the campaign
// pipeline (/api/campaigns/:id/send) — the old ad-hoc /api/send-emails path
// (no tracking, no unsubscribe header, no suppression) was removed.

const { showResetConfirm, resetDashboardState, showToast } = useDashboardState()

function resetAll() {
  showResetConfirm.value = true
}

function performFullReset() {
  resetDashboardState()
  showToast('Campaña reiniciada', 'info')
}

async function logout() {
  const config = useRuntimeConfig()
  const refreshToken = localStorage.getItem('tm_refresh_token')
  localStorage.removeItem('tm_refresh_token')
  await $fetch('/api/auth/logout', {
    method: 'POST',
    body: refreshToken ? { refreshToken } : {},
  }).catch(() => {})
  window.location.href = `/login?portal=${config.public.portalKey}`
}

export function useCampaignSender() {
  return { resetAll, performFullReset, logout }
}
