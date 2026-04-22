import { ref, reactive, computed } from 'vue'

// ─── Module-level singleton state ─────────────────────────────────────────────

// DOM refs
export const subjectInputRef = ref<HTMLInputElement | null>(null)
export const xlsxInputRef = ref<HTMLInputElement | null>(null)
export const htmlInputRef = ref<HTMLInputElement | null>(null)

// Contact / XLSX state
const xlsxFileName = ref('')
const emails = ref<string[]>([])
const selectedEmails = ref<string[]>([])
const availableColumns = ref<string[]>([])
const selectedColumn = ref('Email')
const empresaColumn = ref('')
const nombreColumn = ref('')
const rawRows = ref<Record<string, any>[]>([])
const xlsxDragging = ref(false)

// HTML template state
const htmlFileName = ref('')
const htmlBody = ref('')
const htmlDragging = ref(false)

// Campaign state
const emailSubject = ref('')
const isSending = ref(false)
const sendResults = ref<{ email: string; status: string }[]>([])
const showResetConfirm = ref(false)

// Template library state
const internalTemplates = ref<{ name: string; path: string }[]>([])
const selectedInternalTemplate = ref('')
const showTemplatesModal = ref(false)
const libraryId = ref(Date.now())
const copied = ref(false)

// Toast state
const toast = reactive({
  visible: false,
  message: '',
  type: 'info' as 'success' | 'error' | 'info',
})

// Dialog state
const dialogState = reactive({
  show: false,
  type: 'confirm' as 'confirm' | 'prompt',
  title: '',
  message: '',
  value: '',
  resolve: null as ((v: any) => void) | null,
})

function showDialog(options: { 
  type?: 'confirm' | 'prompt', 
  title: string, 
  message?: string, 
  defaultValue?: string 
}): Promise<any> {
  return new Promise((resolve) => {
    dialogState.type = options.type || 'confirm'
    dialogState.title = options.title
    dialogState.message = options.message || ''
    dialogState.value = options.defaultValue || ''
    dialogState.resolve = resolve
    dialogState.show = true
  })
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  toast.message = message
  toast.type = type
  toast.visible = true
  setTimeout(() => (toast.visible = false), 3000)
}

// ─── Computed ──────────────────────────────────────────────────────────────────

function applyVars(template: string, empresa: string, nombre: string, email: string): string {
  return template
    .replace(/\{\{\s*Empresa\s*\}\}/gi, empresa || '')
    .replace(/\{\{\s*Nombre\s*\}\}/gi, nombre || '')
    .replace(/\{\{\s*Email\s*\}\}/gi, email || '')
}

const contactRows = computed(() =>
  rawRows.value.map((row) => ({
    email: String(row[selectedColumn.value] || '').trim(),
    empresa: empresaColumn.value ? String(row[empresaColumn.value] || '').trim() : '',
    nombre: nombreColumn.value ? String(row[nombreColumn.value] || '').trim() : '',
  })),
)

const subjectPreview = computed(() => {
  if (!emailSubject.value || !contactRows.value.length) return ''
  const first = contactRows.value[0]
  return applyVars(emailSubject.value, first.empresa, first.nombre, first.email)
})

const personalizedPreviewHtml = computed(() => {
  if (!htmlBody.value) return ''
  const first = contactRows.value[0] || { empresa: '', nombre: '', email: '' }
  return applyVars(htmlBody.value, first.empresa, first.nombre, first.email)
})

const canSend = computed(() =>
  emailSubject.value.trim().length > 0 && htmlBody.value.length > 0 && selectedEmails.value.length > 0,
)

const sentCount = computed(() => sendResults.value.filter((r) => r.status === 'sent').length)
const failedCount = computed(() => sendResults.value.filter((r) => r.status === 'failed').length)

function stepStatus(i: number) {
  const flags = [
    emails.value.length > 0,
    emailSubject.value.length > 0,
    htmlBody.value.length > 0,
    sendResults.value.length > 0,
  ]
  if (flags[i]) return 'done'
  if (i === 0 || flags[i - 1]) return 'active'
  return 'pending'
}

// ─── Reset ─────────────────────────────────────────────────────────────────────

function resetDashboardState() {
  xlsxFileName.value = ''
  emails.value = []
  selectedEmails.value = []
  availableColumns.value = []
  selectedColumn.value = 'Email'
  empresaColumn.value = ''
  nombreColumn.value = ''
  rawRows.value = []
  xlsxDragging.value = false
  htmlFileName.value = ''
  htmlBody.value = ''
  htmlDragging.value = false
  emailSubject.value = ''
  isSending.value = false
  sendResults.value = []
  showResetConfirm.value = false
  selectedInternalTemplate.value = ''
  showTemplatesModal.value = false
}

export function useDashboardState() {
  return {
    // DOM refs
    subjectInputRef,
    xlsxInputRef,
    htmlInputRef,
    // Contact
    xlsxFileName,
    emails,
    selectedEmails,
    availableColumns,
    selectedColumn,
    empresaColumn,
    nombreColumn,
    rawRows,
    xlsxDragging,
    // HTML
    htmlFileName,
    htmlBody,
    htmlDragging,
    // Campaign
    emailSubject,
    isSending,
    sendResults,
    showResetConfirm,
    // Library
    internalTemplates,
    selectedInternalTemplate,
    showTemplatesModal,
    libraryId,
    copied,
    // Dialog
    dialogState,
    showDialog,
    // Toast
    toast,
    showToast,
    // Computed
    contactRows,
    subjectPreview,
    personalizedPreviewHtml,
    canSend,
    sentCount,
    failedCount,
    stepStatus,
    applyVars,
    // Reset
    resetDashboardState,
  }
}
