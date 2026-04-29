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
const agencyColumn = ref('')
const puestoColumn = ref('')
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

  // Helper to normalize strings (remove accents, lowercase, remove non-alphanumeric)
  const normRaw = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  const VAR_MAP: Record<string, string[]> = {
    name: ['Nombre', 'Name', 'FirstName', 'First Name', 'Contacto', 'Contact', 'Persona'],
    company: ['Empresa', 'Company', 'Business', 'Organization', 'Entidad', 'Brand', 'Company_Name', 'Company Name', 'Nombre_Empresa', 'Nombre Empresa'],
    agency: ['Agencia', 'Agency', 'Nombre_Agencia', 'Agency_Name', 'Nombre Agencia', 'Agency Name', 'Agency_Brand', 'Marca_Agencia'],
    role: ['Puesto', 'Cargo', 'Role', 'Position', 'Job Title', 'Titular'],
    url: ['URL', 'Link', 'Web', 'Website', 'Sitio'],
    linkedin: ['Linkedin', 'LinkedIn', 'Perfil'],
    instagram: ['Instagram', 'IG', 'Insta'],
    youtube: ['Youtube', 'YouTube', 'YT', 'Canal'],
    phone: ['Telefono', 'Teléfono', 'Phone', 'Cell', 'Mobile', 'WhatsApp'],
    city: ['Ciudad', 'City', 'Población', 'Location'],
    country: ['Pais', 'País', 'Country', 'Nación'],
    service: ['Servicio', 'Service', 'Producto', 'Product', 'Interés'],
    email: ['Email', 'Correo', 'Mail']
  }

  // Support for specific column mapping from the XLSX UI
  const fieldMapping: Record<string, string> = {
    name: nombreColumn.value,
    company: empresaColumn.value,
    agency: agencyColumn.value,
    role: puestoColumn.value,
    email: selectedColumn.value,
    linkedin: linkedinColumn.value,
    url: urlColumn.value,
    youtube: youtubeColumn.value,
    instagram: instagramColumn.value,
  }

  // 1. Process Predefined Mappings with smart lookup
  for (const [field, aliases] of Object.entries(VAR_MAP)) {
    const colName = fieldMapping[field]
    let value = colName ? row[colName] : row[field]

    if (value === undefined) {
      // Try to find by normalized alias
      for (const alias of aliases) {
        const normalizedAlias = normRaw(alias);
        const foundKey = Object.keys(row).find(k => normRaw(k) === normalizedAlias);
        if (foundKey) {
          value = row[foundKey];
          break;
        }
      }
    }
    
    const finalValue = value === null || value === undefined ? '' : String(value)

    // Replace all aliases and the field name
    const allTokens = [...aliases, field];
    for (const token of allTokens) {
      // Regex for exact match (case insensitive)
      const reg = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'gi')
      result = result.replace(reg, finalValue)
      
      // Smart Accent-insensitive replace:
      // We look for anything inside {{ }} and check if its normalization matches the token's normalization
      const dynamicVarReg = /\{\{\s*([^}]+)\s*\}\}/g;
      result = result.replace(dynamicVarReg, (match, varName) => {
        if (normRaw(varName) === normRaw(token)) return finalValue;
        return match;
      });
    }
  }

  // 2. Dynamic column support for EVERYTHING else
  Object.keys(row).forEach(key => {
    const finalValue = row[key] === null || row[key] === undefined ? '' : String(row[key])
    
    // Replace exact key match
    const exactRegex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
    result = result.replace(exactRegex, finalValue)

    // Replace normalized key match
    const dynamicVarReg = /\{\{\s*([^}]+)\s*\}\}/g;
    result = result.replace(dynamicVarReg, (match, varName) => {
      if (normRaw(varName) === normRaw(key)) return finalValue;
      return match;
    });
  });

  return result
}

const contactRows = computed<Array<Record<string, any>>>(() =>
  rawRows.value.map((row) => ({
    ...row,
    email: String(row[selectedColumn.value] || '').trim(),
    empresa: empresaColumn.value ? String(row[empresaColumn.value] || '').trim() : '',
    nombre: nombreColumn.value ? String(row[nombreColumn.value] || '').trim() : '',
    agency: agencyColumn.value ? String(row[agencyColumn.value] || '').trim() : '',
    puesto: puestoColumn.value ? String(row[puestoColumn.value] || '').trim() : '',
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
  const bc = new BroadcastChannel('TurboMailer-templates')
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
  agencyColumn.value = ''
  puestoColumn.value = ''
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
    agencyColumn,
    puestoColumn,
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
