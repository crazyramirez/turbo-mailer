import { ref } from 'vue'

// Singleton state that persists across page navigations
const step = ref(1)
const form = ref({
  name: '',
  subject: '',
  listId: null as number | null,
  templateName: '',
  templateHtml: '',
})

export function useCampaignWizardState() {
  function resetWizard() {
    step.value = 1
    form.value = {
      name: '',
      subject: '',
      listId: null,
      templateName: '',
      templateHtml: '',
    }
  }

  return {
    step,
    form,
    resetWizard
  }
}
