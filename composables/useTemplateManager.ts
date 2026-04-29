import { useEditorState } from '~/composables/useEditorState'
import { useToast } from '~/composables/useToast'
import { useIframeEngine } from '~/composables/useIframeEngine'

const {
  templates,
  currentTemplate,
  isTemplateLoading,
  isSaving,
  showTemplateModal,
  newTemplateName,
  lastSavedTime,
  layerList,
  htmlContent,
} = useEditorState()

const { showToast } = useToast()

async function loadTemplates() {
  try {
    const all = await $fetch<{ name: string; path: string }[]>('/api/templates')
    templates.value = all || []
  } catch {
    templates.value = []
  }
}

async function loadTemplate(name: string, animate = true) {
  try {
    if (animate) {
      isTemplateLoading.value = true
      layerList.value = []
    }
    const data = await $fetch<any>('/api/templates', { query: { name } })
    htmlContent.value = data.content
    currentTemplate.value = name
    localStorage.setItem('last_edited_template', name)

    const { injectIframeContent } = useIframeEngine()
    if (animate) {
      setTimeout(() => {
        injectIframeContent()
        lastSavedTime.value = ''
        setTimeout(() => (isTemplateLoading.value = false), 150)
      }, 150)
    } else {
      injectIframeContent()
      lastSavedTime.value = ''
    }
  } catch {
    isTemplateLoading.value = false
    currentTemplate.value = ''
    localStorage.removeItem('last_edited_template')
    useIframeEngine().injectIframeContent()
    showToast((useNuxtApp().$i18n as any).t('editor.template_load_error'), 'error')
  }
}

async function deleteTemplate(name: string) {
  const { openPrompt } = await import('~/composables/usePrompt').then((m) => m.usePrompt())
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(
    i18n.t('editor.template_delete_title'),
    i18n.t('editor.template_delete_label', { name }),
    '',
    'confirm',
    async () => {
      try {
        await saveTemplate(true)
        await $fetch('/api/templates', { method: 'DELETE', body: { name } })
        await loadTemplates()
        if (currentTemplate.value === name) {
          currentTemplate.value = ''
          htmlContent.value = ''
          useIframeEngine().injectIframeContent()
        }
        showToast(i18n.t('editor.template_deleted'), 'info')
      } catch {
        showToast(i18n.t('editor.template_delete_error'), 'error')
      }
    },
    'danger',
    i18n.t('editor.template_delete_confirm'),
  )
}

async function renameTemplate(oldName: string) {
  const { openPrompt } = await import('~/composables/usePrompt').then((m) => m.usePrompt())
  const i18n = (useNuxtApp().$i18n as any)
  openPrompt(i18n.t('editor.template_rename_title'), i18n.t('editor.template_rename_label'), oldName, 'text', async (newName) => {
    if (!newName || newName === oldName) return
    try {
      await $fetch('/api/templates', { method: 'PATCH', body: { oldName, newName } })
      if (currentTemplate.value === oldName) {
        currentTemplate.value = newName
        localStorage.setItem('last_edited_template', newName)
      }
      await loadTemplates()
      showToast(i18n.t('editor.template_renamed'), 'success')
    } catch {
      showToast(i18n.t('editor.template_rename_error'), 'error')
    }
  })
}

async function saveTemplate(silent = false) {
  if (!silent) isSaving.value = true
  try {
    const finalHtml = useIframeEngine().getSurgicalCleanHtml()
    if (!finalHtml) return

    await $fetch('/api/templates', {
      method: 'POST',
      body: { name: currentTemplate.value, content: finalHtml },
    })

    localStorage.setItem('last_edited_template', currentTemplate.value)

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('TurboMailer-templates')
      bc.postMessage({ type: 'template-saved', name: currentTemplate.value, content: finalHtml })
      bc.close()
    }

    if (!silent) {
      await loadTemplates()
      showToast((useNuxtApp().$i18n as any).t('editor.template_saved'), 'success')
    }

    const now = new Date()
    lastSavedTime.value = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0')
  } catch {
    if (!silent) showToast((useNuxtApp().$i18n as any).t('editor.template_save_error'), 'error')
  } finally {
    if (!silent) isSaving.value = false
  }
}

async function handleSave() {
  if (!currentTemplate.value) {
    showTemplateModal.value = true
    return
  }
  await saveTemplate()
}

async function createNewTemplate() {
  if (!newTemplateName.value) return
  
  // Siempre que se crea manualmente, empezamos con un lienzo vacío (petición del usuario)
  htmlContent.value = `<!DOCTYPE html>
<html lang="es">
<head>
  <style>
    body { 
      margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, sans-serif; 
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    .main-card {
      width: 100%;
      max-width: 820px;
      margin: 0 auto 20px auto;
      background: #ffffff;
      border-radius: 24px;
      box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
    @media only screen and (max-width: 600px) {
      .main-card { border-radius: 20px !important; }
      .header-block, .body-block, .methodology-block, .presence-block, .card-block, .cta-block, .signature-block {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .grid-quad-td {
        display: inline-block !important;
        width: 50% !important;
        box-sizing: border-box !important;
        padding: 4px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="margin:0;padding:0;width:100%;background-color:#ffffff;">
    <div style="margin:0 auto;padding: 0px;">
      <div class="main-card" style="width:100%;max-width:820px;margin:0 auto;background:#ffffff;border: 1px solid #e9e9e9;border-radius:20px;box-shadow:0 10px 40px rgba(15, 23, 42, 0.08);overflow:hidden;"></div>
    </div>
  </div>
</body>
</html>`

  currentTemplate.value = newTemplateName.value
  localStorage.setItem('last_edited_template', currentTemplate.value)
  showTemplateModal.value = false
  
  const { injectIframeContent } = useIframeEngine()
  injectIframeContent()
  
  await saveTemplate()
  newTemplateName.value = ''
}

async function autoCreateTemplate() {
  // Solo auto-creamos si estamos en la demo o no hay ninguna plantilla seleccionada
  if (currentTemplate.value !== 'email_demo' && currentTemplate.value !== '') return
  
  const now = new Date()
  const timestamp = now.toLocaleDateString().replace(/\//g, '-') + '-' + now.getHours() + now.getMinutes()
  const defaultName = (useNuxtApp().$i18n as any).t('editor.template_default_name', { timestamp })
  
  currentTemplate.value = defaultName
  localStorage.setItem('last_edited_template', defaultName)
  
  await saveTemplate(true)
  await loadTemplates()
  showToast((useNuxtApp().$i18n as any).t('editor.template_auto_linked'), 'info')
}

async function downloadHtml() {
  const i18n = (useNuxtApp().$i18n as any)
  
  if (!currentTemplate.value) {
    showToast(i18n.t('editor.template_required_download'), 'warning')
    showTemplateModal.value = true
    return
  }

  // First save changes
  await saveTemplate()

  const finalHtml = useIframeEngine().getSurgicalCleanHtml()
  if (!finalHtml) return

  const blob = new Blob([finalHtml], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${currentTemplate.value}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  showToast(i18n.t('editor.download_started'), 'success')
}

export function useTemplateManager() {
  return {
    loadTemplates,
    loadTemplate,
    deleteTemplate,
    renameTemplate,
    saveTemplate,
    handleSave,
    createNewTemplate,
    autoCreateTemplate,
    downloadHtml,
  }
}
