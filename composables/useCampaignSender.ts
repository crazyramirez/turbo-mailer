import { nextTick } from 'vue'
import { useDashboardState } from '~/composables/useDashboardState'

const {
  emailSubject,
  htmlBody,
  isSending,
  sendResults,
  showResetConfirm,
  showSendConfirm,
  lastSentCount,
  contactRows,
  selectedEmails,
  empresaColumn,
  nombreColumn,
  linkedinColumn,
  urlColumn,
  youtubeColumn,
  instagramColumn,
  resetFormFields,
  resetDashboardState,
  showToast,
} = useDashboardState()

async function sendEmails() {
  if (isSending.value) return
  isSending.value = true
  sendResults.value = []

  const recipients = contactRows.value
    .filter((r) => selectedEmails.value.includes(r.email))
    .map((r) => {
      // Create a vars object with all original columns + global shortcuts
      const vars: Record<string, any> = { ...r }
      // Ensure Empresa, Nombre and Email are also available even if the columns are named differently
      vars.Empresa = r.empresa
      vars.Contacto = r.nombre
      vars.Email = r.email
      vars.Linkedin = r[linkedinColumn.value] || ''
      vars.URL = r[urlColumn.value] || ''
      vars.Youtube = r[youtubeColumn.value] || ''
      vars.Instagram = r[instagramColumn.value] || ''
      
      return {
        email: r.email,
        vars
      }
    })

  try {
    const res = await $fetch<any>('/api/send-emails', {
      method: 'POST',
      body: { subject: emailSubject.value, htmlBody: htmlBody.value, recipients },
    })
    sendResults.value = res.results
    lastSentCount.value = res.results.filter((r: any) => r.status === 'sent').length
    resetFormFields()
    showToast('Campaña finalizada', 'success')
  } catch {
    showToast('Error en el envío', 'error')
  } finally {
    isSending.value = false
  }
}

function confirmSend() {
  showSendConfirm.value = true
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
  return { sendEmails, confirmSend, resetAll, performFullReset, logout, insertVar }
}
