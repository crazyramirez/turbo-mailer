import { nextTick } from 'vue'
import { useDashboardState } from '~/composables/useDashboardState'

const {
  emailSubject,
  isSending,
  sendResults,
  showResetConfirm,
  contactRows,
  selectedEmails,
  htmlBody,
  subjectInputRef,
  showToast,
  resetDashboardState,
} = useDashboardState()

async function sendEmails() {
  if (isSending.value) return
  isSending.value = true
  sendResults.value = []

  const recipients = contactRows.value
    .filter((r) => selectedEmails.value.includes(r.email))
    .map((r) => ({
      email: r.email,
      vars: { Empresa: r.empresa, Nombre: r.nombre, Email: r.email },
    }))

  try {
    const res = await $fetch<any>('/api/send-emails', {
      method: 'POST',
      body: { subject: emailSubject.value, htmlBody: htmlBody.value, recipients },
    })
    sendResults.value = res.results
    showToast('Campaña finalizada', 'success')
  } catch {
    showToast('Error en el envío', 'error')
  } finally {
    isSending.value = false
  }
}

function resetAll() {
  showResetConfirm.value = true
}

function performFullReset() {
  resetDashboardState()
  showToast('Campaña reiniciada', 'info')
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  window.location.href = '/login'
}

function insertVar(token: string) {
  emailSubject.value += token + ' '
  nextTick(() => subjectInputRef.value?.focus())
}

export function useCampaignSender() {
  return { sendEmails, resetAll, performFullReset, logout, insertVar }
}
