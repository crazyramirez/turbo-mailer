import { useDashboardState } from '~/composables/useDashboardState'

const {
  htmlFileName,
  htmlBody,
  htmlDragging,
  internalTemplates,
  selectedInternalTemplate,
  showTemplatesModal,
  libraryId,
  showToast,
  showDialog,
} = useDashboardState()

function parseHtml(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    htmlBody.value = e.target!.result as string
    showToast('Plantilla cargada', 'success')
  }
  reader.readAsText(file)
}

function clearHtml() {
  htmlFileName.value = ''
  htmlBody.value = ''
  selectedInternalTemplate.value = ''
  showToast('Plantilla eliminada', 'info')
}

function onHtmlChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    htmlFileName.value = file.name
    parseHtml(file)
  }
}

function onHtmlDrop(e: DragEvent) {
  htmlDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    htmlFileName.value = file.name
    parseHtml(file)
  }
}

async function fetchInternalTemplates() {
  try {
    const data = await $fetch<{ name: string; path: string }[]>('/api/templates')
    internalTemplates.value = data
  } catch {
    // silent — library just won't show
  }
}

async function openLibrary() {
  libraryId.value = Date.now()
  showTemplatesModal.value = true
}

async function selectInternalTemplate(name: string) {
  selectedInternalTemplate.value = name
  try {
    const res = await $fetch<any>(`/api/templates?name=${name}`)
    htmlBody.value = res.content
    htmlFileName.value = `${name}.html`
    showToast('Plantilla interna cargada', 'success')
  } catch {
    showToast('Error al cargar plantilla interna', 'error')
  }
  showTemplatesModal.value = false
}

async function deleteTemplate(name: string) {
  const confirmed = await showDialog({
    type: 'confirm',
    title: 'Eliminar Plantilla',
    message: `¿Estás seguro de que quieres eliminar "${name}"? Esta acción no se puede deshacer.`,
  })
  if (!confirmed) return
  try {
    await $fetch('/api/templates', {
      method: 'DELETE',
      body: { name },
    })
    await fetchInternalTemplates()
    showToast('Plantilla eliminada', 'success')
  } catch (e) {
    showToast('Error al eliminar la plantilla', 'error')
  }
}

async function renameTemplate(oldName: string, newName: string) {
  if (!newName || oldName === newName) return
  try {
    await $fetch('/api/templates', {
      method: 'PATCH',
      body: { oldName, newName },
    })
    await fetchInternalTemplates()
    showToast('Plantilla renombrada', 'success')
  } catch (e) {
    showToast('Error al renombrar la plantilla', 'error')
  }
}

export function useHtmlImport() {
  return {
    parseHtml,
    clearHtml,
    onHtmlChange,
    onHtmlDrop,
    fetchInternalTemplates,
    openLibrary,
    selectInternalTemplate,
    deleteTemplate,
    renameTemplate,
  }
}
