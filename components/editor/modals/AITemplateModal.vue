<script setup lang="ts">
import CampaignAssistant from '~/components/campaigns/CampaignAssistant.vue'
import { useEditorState } from '~/composables/useEditorState'
import { useTemplateManager } from '~/composables/useTemplateManager'
import { useIframeEngine } from '~/composables/useIframeEngine'
import { useToast } from '~/composables/useToast'
import { editorStyleBases } from '~/utils/editorStyles'
import type { EditorAssistantDraft } from '~/utils/editorAssistant'

const { showAITemplateModal, currentTemplate, currentStyle, htmlContent, lastSavedTime, iframeRef, undoStack, redoStack, selectedElement, selectedSubElement, activePanel, isTemplateLoading } = useEditorState()
const { loadTemplates, awaitPendingSaves } = useTemplateManager()
const engine = useIframeEngine()
const { showToast } = useToast()

function uniqueName(name: string) {
  const clean = name.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\.+$/g, '').trim().slice(0, 65) || 'Campaña IA'
  return `${clean}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`.slice(0, 100)
}
async function applyDraft(draft: EditorAssistantDraft, nextHtml: string) {
  const previousHtml = engine.getSurgicalCleanHtml() || htmlContent.value
  const previousName = currentTemplate.value
  const previousStyle = currentStyle.value
  const previousUndo = [...undoStack.value]
  const previousRedo = [...redoStack.value]
  const nextName = uniqueName(draft.name)
  let canvasSwitched = false
  let injectionStarted = false
  engine.teardownEditor()
  try {
    await awaitPendingSaves()
    // Preserve unnamed work too, before changing the editor's only local draft.
    if (previousHtml) {
      const backupName = previousName && previousName !== 'email_demo' ? previousName : uniqueName('Borrador anterior a IA')
      await $fetch('/api/templates', { method: 'POST', body: { name: backupName, content: previousHtml } })
    }
    await $fetch('/api/templates', { method: 'POST', body: { name: nextName, content: nextHtml } })
    // Replace synchronously only after both writes succeed. Never autosave with
    // the new name while the iframe still contains the previous document.
    currentTemplate.value = nextName
    htmlContent.value = nextHtml
    currentStyle.value = editorStyleBases.find(item => item.id === draft?.styleId) || editorStyleBases[0]
    selectedElement.value = null
    selectedSubElement.value = null
    activePanel.value = 'layers'
    undoStack.value = []
    redoStack.value = []
    injectionStarted = true
    engine.injectIframeContent()
    canvasSwitched = true
    try {
      localStorage.setItem('last_edited_template', nextName)
      localStorage.setItem('editor_html_draft', nextHtml)
    } catch { /* The server copy is already safe if browser storage is full. */ }
    lastSavedTime.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    await loadTemplates()
    showAITemplateModal.value = false
    showToast('Propuesta guardada como nueva plantilla. Ya puedes editar todos sus módulos.', 'success')
  } catch (cause: any) {
    if (!canvasSwitched) {
      currentTemplate.value = previousName
      currentStyle.value = previousStyle
      htmlContent.value = previousHtml
      if (injectionStarted) engine.injectIframeContent()
      else {
        const doc = iframeRef.value?.contentDocument
        if (doc) engine.setupIframeEvents(doc)
      }
      undoStack.value = previousUndo
      redoStack.value = previousRedo
      throw new Error(`No se ha aplicado la propuesta. ${cause?.data?.statusMessage || cause?.message || String(cause)}`)
    } else {
      showAITemplateModal.value = false
      showToast('La propuesta está guardada y aplicada. Actualiza la lista de plantillas si no aparece todavía.', 'info')
    }
  }
}
</script>

<template>
  <CampaignAssistant :open="showAITemplateModal" :apply="applyDraft" :apply-disabled="isTemplateLoading" @close="showAITemplateModal = false" @notify="showToast" />
</template>
