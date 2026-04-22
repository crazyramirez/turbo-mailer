import { ref, reactive } from 'vue'

export interface Template {
  name: string
  path: string
}

export interface LayerItem {
  id: string
  type: string
  text: string
  el: HTMLElement
}

// ─── Module-level singleton state ────────────────────────────────────────────
// All reactive refs live here so every composable and component shares one instance.

const iframeRef = ref<HTMLIFrameElement | null>(null)
const viewMode = ref<'desktop' | 'mobile'>('desktop')
const activePanel = ref<'layers' | 'edit' | 'fonts'>('layers')
const selectedElement = ref<HTMLElement | null>(null)
const selectedSubElement = ref<HTMLElement | null>(null)
const layerList = ref<LayerItem[]>([])

const templates = ref<Template[]>([])
const currentTemplate = ref('')
const isTemplateLoading = ref(false)
const isSaving = ref(false)
const isMorphing = ref(false)
const showTemplateModal = ref(false)
const newTemplateName = ref('')
const lastSavedTime = ref('')

const fontSizeRef = ref(16)
const selectionBaseRef = ref(16)
const logoWidthRef = ref(150)
const refreshLayersTrigger = ref(0)
const visibilityTrigger = ref(0)
const layoutTrigger = ref(0)
const originalFontBeforePreview = ref('')
const originalColorBeforePreview = ref('')

const isSidebarDragging = ref(false)
const isLayerDragging = ref(false)
const isDraggingOverIframe = ref(false)

const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const maxHistory = 30

const htmlContent = ref(`<!DOCTYPE html>
<html lang="es">
<head>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: Arial, sans-serif; }
    .main-card {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      min-height: 500px;
      border-radius: 24px;
      box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;">
  <div style="margin:0;padding:0;width:100%;background-color:#f8fafc;">
    <div style="width:100%;margin:0 auto;padding:40px 0;">
      <div class="main-card"></div>
    </div>
  </div>
</body>
</html>`)

const editorDragState = reactive({
  draggedModule: null as string | null,
  draggedLayer: null as HTMLElement | null,
})

const toast = reactive({
  visible: false,
  message: '',
  type: 'info' as 'success' | 'error' | 'info',
})

const promptData = reactive({
  visible: false,
  mode: 'text' as 'text' | 'color' | 'font' | 'confirm',
  variant: 'primary' as 'primary' | 'danger',
  confirmLabel: 'Aplicar',
  title: '',
  label: '',
  value: '',
  callback: (_val: string) => {},
})

const imageModal = reactive({
  visible: false,
  src: '',
  link: '',
  target: '_blank',
  targetEl: null as HTMLImageElement | null,
  linkEl: null as HTMLAnchorElement | null,
})

// ─── Reset function (call on editor unmount to clear DOM refs) ────────────────
function resetEditorState() {
  selectedElement.value = null
  selectedSubElement.value = null
  layerList.value = []
  undoStack.value = []
  redoStack.value = []
  editorDragState.draggedModule = null
  editorDragState.draggedLayer = null
  iframeRef.value = null
}

export function useEditorState() {
  return {
    iframeRef,
    viewMode,
    activePanel,
    selectedElement,
    selectedSubElement,
    layerList,
    templates,
    currentTemplate,
    isTemplateLoading,
    isSaving,
    isMorphing,
    showTemplateModal,
    newTemplateName,
    lastSavedTime,
    fontSizeRef,
    selectionBaseRef,
    logoWidthRef,
    refreshLayersTrigger,
    visibilityTrigger,
    layoutTrigger,
    originalFontBeforePreview,
    originalColorBeforePreview,
    isSidebarDragging,
    isLayerDragging,
    isDraggingOverIframe,
    undoStack,
    redoStack,
    maxHistory,
    htmlContent,
    editorDragState,
    toast,
    promptData,
    imageModal,
    resetEditorState,
  }
}
