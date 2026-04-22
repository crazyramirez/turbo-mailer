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
    templates.value = (all || []).filter((t) => t.name !== 'email_demo')
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
    showToast('Error al cargar plantilla, se inició lienzo vacío', 'error')
  }
}

async function deleteTemplate(name: string) {
  const { openPrompt } = await import('~/composables/usePrompt').then((m) => m.usePrompt())
  openPrompt(
    'Eliminar Plantilla',
    `¿Deseas eliminar "${name}" permanentemente?`,
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
        showToast('Plantilla eliminada', 'info')
      } catch {
        showToast('Error al eliminar', 'error')
      }
    },
    'danger',
    'Eliminar',
  )
}

async function renameTemplate(oldName: string) {
  const { openPrompt } = await import('~/composables/usePrompt').then((m) => m.usePrompt())
  openPrompt('Renombrar Plantilla', 'Nuevo nombre del archivo:', oldName, 'text', async (newName) => {
    if (!newName || newName === oldName) return
    try {
      await $fetch('/api/templates', { method: 'PATCH', body: { oldName, newName } })
      if (currentTemplate.value === oldName) {
        currentTemplate.value = newName
        localStorage.setItem('last_edited_template', newName)
      }
      await loadTemplates()
      showToast('Plantilla renombrada', 'success')
    } catch {
      showToast('Error al renombrar', 'error')
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
      const bc = new BroadcastChannel('turbo-mailer-templates')
      bc.postMessage({ type: 'template-saved', name: currentTemplate.value, content: finalHtml })
      bc.close()
    }

    if (!silent) {
      await loadTemplates()
      showToast('Plantilla guardada', 'success')
    }

    const now = new Date()
    lastSavedTime.value = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0')
  } catch {
    if (!silent) showToast('Error al guardar', 'error')
  } finally {
    if (!silent) isSaving.value = false
  }
}

async function handleSave() {
  if (!currentTemplate.value || currentTemplate.value === 'email_demo') {
    showTemplateModal.value = true
    return
  }
  await saveTemplate()
}

function createNewTemplate() {
  if (!newTemplateName.value) return
  currentTemplate.value = newTemplateName.value
  
  // Reiniciamos a una estructura base vacía
  htmlContent.value = `<!DOCTYPE html>
<html lang="es">
<head>
  <style>
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, sans-serif; }
    .main-card {
      width: 100%;
      max-width: 820px;
      margin: 0 auto 80px auto;
      background: #ffffff;
      min-height: 500px;
      border-radius: 24px;
      box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="margin:0;padding:0;width:100%;background-color:#ffffff;">
    <div style="width:100%;margin:0 auto;padding:40px;">
      <div class="main-card" style="width:100%;max-width:820px;margin:0 auto;background:#ffffff;border-radius:24px;box-shadow:0 10px 40px rgba(15, 23, 42, 0.08);overflow:hidden;min-height:500px;"></div>
    </div>
  </div>
</body>
</html>`

  localStorage.setItem('last_edited_template', currentTemplate.value)
  showTemplateModal.value = false
  
  // Limpiamos el editor y guardamos
  const { injectIframeContent } = useIframeEngine()
  injectIframeContent()
  
  saveTemplate()
  newTemplateName.value = ''
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
  }
}
