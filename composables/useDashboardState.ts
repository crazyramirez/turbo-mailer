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
const linkedinColumn = ref('')
const urlColumn = ref('')
const youtubeColumn = ref('')
const instagramColumn = ref('')
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
const showSendConfirm = ref(false)
const lastSentCount = ref(0)

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

function applyVars(template: string, row: Record<string, any>): string {
  if (!template) return ''
  let result = template

  const VAR_MAP: Record<string, string[]> = {
    name: ['Nombre', 'Name', 'FirstName', 'First Name', 'Contacto', 'Contact'],
    company: ['Empresa', 'Company', 'Business', 'Organization'],
    url: ['URL', 'Link', 'Web', 'Website'],
    linkedin: ['Linkedin', 'LinkedIn'],
    instagram: ['Instagram', 'IG'],
    youtube: ['Youtube', 'YouTube', 'YT'],
    phone: ['Telefono', 'Teléfono', 'Phone', 'Cell', 'Mobile'],
    email: ['Email', 'Correo', 'Mail']
  }

  // Support for specific column mapping from the XLSX UI
  const fieldMapping: Record<string, string> = {
    name: nombreColumn.value,
    company: empresaColumn.value,
    email: selectedColumn.value,
    linkedin: linkedinColumn.value,
    url: urlColumn.value,
    youtube: youtubeColumn.value,
    instagram: instagramColumn.value,
  }

  // Iterate over our defined mappings
  for (const [field, aliases] of Object.entries(VAR_MAP)) {
    // Try to find the value
    const colName = fieldMapping[field]
    let value = colName ? row[colName] : row[field]

    if (value === undefined) {
      for (const alias of aliases) {
        if (row[alias] !== undefined) {
          value = row[alias]
          break
        }
        // Try case-insensitive key lookup
        const ciKey = Object.keys(row).find(k => k.toLowerCase() === alias.toLowerCase())
        if (ciKey) {
          value = row[ciKey]
          break
        }
      }
    }
    
    const finalValue = value === null || value === undefined ? '' : String(value)

    // Replace all aliases (case-insensitive)
    for (const alias of aliases) {
      const reg = new RegExp(`\\{\\{\\s*${alias}\\s*\\}\\}`, 'gi')
      result = result.replace(reg, finalValue)
    }

    // Also replace the field name itself
    const fieldReg = new RegExp(`\\{\\{\\s*${field}\\s*\\}\\}`, 'gi')
    result = result.replace(fieldReg, finalValue)
  }

  // Dynamic column support (XLSX columns or any key in row)
  Object.keys(row).forEach(key => {
    const finalValue = row[key] === null || row[key] === undefined ? '' : String(row[key])
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
    result = result.replace(regex, finalValue)
  })
  
  return result
}

const contactRows = computed(() =>
  rawRows.value.map((row) => ({
    ...row,
    email: String(row[selectedColumn.value] || '').trim(),
    empresa: empresaColumn.value ? String(row[empresaColumn.value] || '').trim() : '',
    nombre: nombreColumn.value ? String(row[nombreColumn.value] || '').trim() : '',
  })),
)

const subjectPreview = computed(() => {
  if (!emailSubject.value || !rawRows.value.length) return ''
  return applyVars(emailSubject.value, rawRows.value[0])
})

const personalizedPreviewHtml = computed(() => {
  if (!htmlBody.value) return ''
  const first = rawRows.value[0] || {}
  return applyVars(htmlBody.value, first)
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

// ─── Template sync (cross-page via BroadcastChannel) ──────────────────────────

function setupTemplateSync(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const bc = new BroadcastChannel('turbo-mailer-templates')
  bc.onmessage = (e) => {
    if (e.data?.type === 'template-saved' && e.data.name === selectedInternalTemplate.value) {
      htmlBody.value = e.data.content
    }
  }
  return () => bc.close()
}

// ─── Reset ─────────────────────────────────────────────────────────────────────

function resetFormFields() {
  xlsxFileName.value = ''
  emails.value = []
  selectedEmails.value = []
  availableColumns.value = []
  selectedColumn.value = 'Email'
  empresaColumn.value = ''
  nombreColumn.value = ''
  linkedinColumn.value = ''
  urlColumn.value = ''
  youtubeColumn.value = ''
  instagramColumn.value = ''
  rawRows.value = []
  xlsxDragging.value = false
  htmlFileName.value = ''
  htmlBody.value = ''
  htmlDragging.value = false
  emailSubject.value = ''
  isSending.value = false
  showResetConfirm.value = false
  showSendConfirm.value = false
  selectedInternalTemplate.value = ''
  showTemplatesModal.value = false
}

function resetDashboardState() {
  resetFormFields()
  sendResults.value = []
  lastSentCount.value = 0
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
    linkedinColumn,
    urlColumn,
    youtubeColumn,
    instagramColumn,
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
    showSendConfirm,
    lastSentCount,
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
    resetFormFields,
    resetDashboardState,
    // Sync
    setupTemplateSync,
  }
}
