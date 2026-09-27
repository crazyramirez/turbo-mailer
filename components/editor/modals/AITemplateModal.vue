<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Copy, Loader2, Monitor, PencilLine, RefreshCw, ShieldCheck, Smartphone, Sparkles, WandSparkles, X } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useTemplateManager } from '~/composables/useTemplateManager'
import { useIframeEngine } from '~/composables/useIframeEngine'
import { useToast } from '~/composables/useToast'
import { assembleEmail } from '~/utils/emailAssembler'
import { editorStyleBases } from '~/utils/editorStyles'
import { editorBlocks } from '~/utils/editorBlocks'
import { emptyAssistantBrief, emptyAssistantSignature, type EditorAssistantContext, type EditorAssistantDraft, type EditorAssistantRequest } from '~/utils/editorAssistant'

const { t } = useI18n()
const { showAITemplateModal, currentTemplate, currentStyle, htmlContent, lastSavedTime, iframeRef, undoStack, redoStack, selectedElement, selectedSubElement, activePanel, isTemplateLoading } = useEditorState()
const { loadTemplates, awaitPendingSaves } = useTemplateManager()
const engine = useIframeEngine()
const { showToast } = useToast()
const brief = reactive(emptyAssistantBrief())
brief.signature = emptyAssistantSignature()
const context = ref<EditorAssistantContext | null>(null)
const contextLoading = ref(false)
const contextError = ref('')
const error = ref('')
const step = ref(0)
const furthestStep = ref(0)
const generating = ref(false)
const applying = ref(false)
const draft = ref<EditorAssistantDraft | null>(null)
const previewHtml = ref('')
const draftBrief = ref('')
const previewMode = ref<'desktop' | 'mobile'>('desktop')
const refinement = ref('')
const signatureSource = ref('new')
const signatureTouched = ref(false)
const formTouched = ref(false)
const modalRef = ref<HTMLElement | null>(null)
const stepHeading = ref<HTMLElement | null>(null)
let generationController: AbortController | null = null
let contextController: AbortController | null = null
let generationSeq = 0
let contextSeq = 0
let returnFocus: HTMLElement | null = null

const steps = [
  { title: 'La campaña', hint: 'Idea y objetivo' },
  { title: 'El contenido', hint: 'Mensaje y acción' },
  { title: 'El diseño', hint: 'Estilo y voz' },
  { title: 'Tu firma', hint: 'Identidad y contacto' },
  { title: 'Crear y revisar', hint: 'Tu propuesta final' },
]
const campaignIdeas = ['Lanzar un producto', 'Newsletter de novedades', 'Invitar a un evento', 'Presentar mis servicios', 'Recuperar clientes']
const objectives = ['Conseguir ventas', 'Generar contactos', 'Recibir reservas', 'Informar y fidelizar', 'Conseguir inscripciones']
const tones = ['Claro, cercano y profesional', 'Elegante y editorial', 'Directo y persuasivo', 'Cálido y personal', 'Creativo y atrevido']
const busy = computed(() => generating.value || applying.value)
const changedSinceDraft = computed(() => !!draft.value && JSON.stringify(brief) !== draftBrief.value)
const chosenStyle = computed(() => editorStyleBases.find(item => item.id === brief.styleId) || editorStyleBases[0])
const selectedSource = computed(() => context.value?.signatures.find(item => item.id === signatureSource.value))
const outline = computed(() => (draft.value?.blocks || []).map(block => ({ id: block.id, name: editorBlocks.find(item => item.id === block.id)?.name || block.id })))
const brandAvailable = computed(() => context.value?.brandConfigured ?? !!(context.value?.brand.name || context.value?.brand.logoUrl || context.value?.brand.website))
const summary = computed(() => [
  { label: 'Campaña', value: brief.campaign, page: 0 },
  { label: 'Objetivo y audiencia', value: [brief.objective, brief.audience].filter(Boolean).join(' · '), page: 0 },
  { label: 'Contenido', value: brief.offer, page: 1 },
  { label: 'Llamada a la acción', value: [brief.ctaText, brief.ctaUrl].filter(Boolean).join(' → ') || 'Sin botón principal', page: 1 },
  { label: 'Dirección visual', value: `${t(chosenStyle.value.name)} · ${brief.tone}${brief.visualDirection ? ` · ${brief.visualDirection}` : ''}`, page: 2 },
  { label: 'Firma', value: brief.includeSignature ? (brief.signature?.name || 'Sin nombre') : 'No incluir firma', page: 3 },
])

function httpUrl(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}
function validImage(value: string) {
  if (!value || !value.startsWith('/uploads/')) return httpUrl(value)
  try {
    let decoded = value
    for (let i = 0; i < 3; i++) decoded = decodeURIComponent(decoded)
    return !/[\\\u0000-\u0020]/.test(decoded) && !decoded.split(/[/?#]/).includes('..') && new URL(value, window.location.origin).pathname.startsWith('/uploads/')
  } catch { return false }
}
function normalizeWebsite() {
  const website = brief.signature?.website.trim() || ''
  if (brief.signature && /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(website)) brief.signature.website = `https://${website}`
}
function validationFor(page: number): string {
  if (page === 0) {
    if (brief.campaign.trim().length < 8) return 'Cuéntame un poco más sobre la campaña (al menos 8 caracteres).'
    if (!brief.objective.trim()) return 'Indica qué quieres conseguir con este email.'
    if (!brief.audience.trim()) return 'Describe a quién va dirigido para personalizar el mensaje.'
  }
  if (page === 1) {
    if (!brief.offer.trim()) return 'Añade la información real que debe aparecer en la campaña.'
    if (!httpUrl(brief.ctaUrl)) return 'El enlace del botón debe comenzar por https:// o http://.'
    if (brief.ctaText.trim() && !brief.ctaUrl.trim()) return 'Añade el enlace de destino del botón o deja su texto vacío.'
    if (brief.ctaUrl.trim() && !brief.ctaText.trim()) return 'Añade el texto del botón principal.'
  }
  if (page === 3 && brief.includeSignature) {
    normalizeWebsite()
    if (!brief.signature || ![brief.signature.name, brief.signature.details, brief.signature.email, brief.signature.website, brief.signature.phone].some(value => value.trim())) return 'Completa al menos un dato de la firma o elige no incluir firma.'
    if (brief.signature.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brief.signature.email)) return 'Revisa el email de la firma.'
    if (!httpUrl(brief.signature.website)) return 'La web de la firma debe comenzar por https:// o http://.'
    if (!validImage(brief.signature.imageUrl)) return 'La imagen de la firma debe ser una URL http(s) o una imagen de /uploads/.'
  }
  return ''
}
async function goTo(page: number) {
  if (busy.value) return
  if (page > step.value) {
    for (let i = 0; i < page; i++) {
      const problem = validationFor(i)
      if (problem) { error.value = problem; step.value = i; await focusStep(); return }
    }
  }
  error.value = ''
  step.value = page
  furthestStep.value = Math.max(furthestStep.value, page)
  await focusStep()
}
async function focusStep() { await nextTick(); stepHeading.value?.focus() }
function chooseSignature(id: string) {
  signatureSource.value = id
  signatureTouched.value = true
  if (id === 'none') { brief.includeSignature = false; return }
  brief.includeSignature = true
  const candidate = context.value?.signatures.find(item => item.id === id)
  brief.signature = candidate ? { ...candidate.signature } : emptyAssistantSignature()
}
function sourceLabel(kind: string) { return kind === 'campaign' ? 'Campaña' : kind === 'template' ? 'Plantilla' : 'Ajustes' }
async function loadContext() {
  contextController?.abort()
  const controller = new AbortController()
  contextController = controller
  const seq = ++contextSeq
  contextLoading.value = true
  contextError.value = ''
  try {
    const result = await $fetch<EditorAssistantContext>('/api/ai/editor-context', { signal: controller.signal })
    if (seq !== contextSeq || controller.signal.aborted) return
    context.value = result
    if (!formTouched.value) {
      if (!brief.audience) brief.audience = result.brand.audience || ''
      if (result.brand.voice) brief.tone = result.brand.voice
      if (result.brand.language) brief.language = result.brand.language
    }
    if (!signatureTouched.value) {
      const newest = result.signatures[0]
      if (newest) {
        brief.signature = { ...newest.signature }
        signatureSource.value = newest.id
      } else if (result.brand.name) {
        brief.signature = { ...emptyAssistantSignature(), name: result.brand.name, website: result.brand.website || '', imageUrl: result.brand.logoUrl || '' }
      }
    }
  } catch (cause: any) {
    if (!controller.signal.aborted && seq === contextSeq) contextError.value = cause?.data?.statusMessage || 'No se han podido recuperar la marca y las firmas. Puedes reintentar o completar los datos manualmente.'
  } finally { if (seq === contextSeq) contextLoading.value = false }
}
function cancelGeneration() {
  generationSeq++
  generationController?.abort()
  generationController = null
  generating.value = false
}
function close() {
  if (applying.value) return
  cancelGeneration()
  contextController?.abort()
  showAITemplateModal.value = false
}
function errorMessage(cause: any) { return cause?.data?.statusMessage || cause?.data?.message || cause?.message || 'No se ha podido completar la solicitud. Reintenta; tus respuestas siguen aquí.' }
async function generate(isRefinement = false) {
  if (busy.value || contextLoading.value) return
  for (let i = 0; i < 4; i++) {
    const problem = validationFor(i)
    if (problem) { error.value = problem; step.value = i; await focusStep(); return }
  }
  if (isRefinement && !refinement.value.trim()) return
  const controller = new AbortController()
  generationController = controller
  const seq = ++generationSeq
  const snapshot = JSON.stringify(brief)
  generating.value = true
  error.value = ''
  try {
    const request: EditorAssistantRequest = { brief: JSON.parse(snapshot) }
    if (isRefinement && draft.value) { request.previous = draft.value; request.instruction = refinement.value.trim() }
    const response = await $fetch<EditorAssistantDraft>('/api/ai/generate-template', { method: 'POST', body: request, signal: controller.signal, timeout: 180_000 })
    if (seq !== generationSeq || controller.signal.aborted) return
    if (response.type !== 'template' || !Array.isArray(response.blocks) || !response.blocks.length) throw new Error('La IA no ha devuelto una propuesta válida. Puedes volver a intentarlo.')
    const html = await assembleEmail({
      blocks: response.blocks, styleId: response.styleId,
      brand: brief.useBrandKit && brandAvailable.value ? context.value?.brand : null,
      language: brief.language, title: response.subject || response.name, preheader: response.preheader,
      resolveImage: async value => validImage(value) ? value : null,
    })
    if (seq !== generationSeq || controller.signal.aborted) return
    draft.value = response
    previewHtml.value = html
    draftBrief.value = snapshot
    refinement.value = ''
    step.value = 4
    furthestStep.value = 4
  } catch (cause: any) {
    if (!controller.signal.aborted && seq === generationSeq) error.value = errorMessage(cause)
  } finally { if (seq === generationSeq) { generating.value = false; generationController = null } }
}
// The proposal is isolated from the live editor, without scripts or navigation.
const previewDocument = computed(() => {
  if (!previewHtml.value) return ''
  const doc = new DOMParser().parseFromString(previewHtml.value, 'text/html')
  const csp = doc.createElement('meta')
  csp.httpEquiv = 'Content-Security-Policy'
  csp.content = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src https:; form-action 'none'; base-uri 'none'"
  doc.head.prepend(csp)
  const style = doc.createElement('style')
  style.textContent = 'a,button,input,form{pointer-events:none!important}body{overflow-x:hidden}'
  doc.head.append(style)
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
})
function uniqueName(name: string) {
  const clean = name.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\.+$/g, '').trim().slice(0, 65) || 'Campaña IA'
  return `${clean}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`.slice(0, 100)
}
async function applyDraft() {
  if (!draft.value || !previewHtml.value || busy.value || changedSinceDraft.value || isTemplateLoading.value) return
  applying.value = true
  error.value = ''
  const previousHtml = engine.getSurgicalCleanHtml() || htmlContent.value
  const previousName = currentTemplate.value
  const previousStyle = currentStyle.value
  const previousUndo = [...undoStack.value]
  const previousRedo = [...redoStack.value]
  const nextHtml = previewHtml.value
  const nextName = uniqueName(draft.value.name)
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
    currentStyle.value = editorStyleBases.find(item => item.id === draft.value?.styleId) || editorStyleBases[0]
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
      error.value = `No se ha aplicado la propuesta. ${errorMessage(cause)}`
    } else {
      showAITemplateModal.value = false
      showToast('La propuesta está guardada y aplicada. Actualiza la lista de plantillas si no aparece todavía.', 'info')
    }
  } finally { applying.value = false }
}
async function copyText(value: string) {
  try { await navigator.clipboard.writeText(value); showToast('Copiado', 'success') }
  catch { showToast('No se ha podido copiar. Selecciona el texto manualmente.', 'info') }
}
function handleKeys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
  if (event.key !== 'Tab' || !modalRef.value) return
  const focusable = Array.from(modalRef.value.querySelectorAll<HTMLElement>('button, input, textarea, select, summary, [tabindex="0"]')).filter(el => !el.matches(':disabled') && el.getClientRects().length > 0)
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
watch(showAITemplateModal, async visible => {
  if (visible) {
    returnFocus = document.activeElement as HTMLElement | null
    await nextTick()
    modalRef.value?.focus()
    void loadContext()
  } else {
    cancelGeneration()
    contextController?.abort()
    returnFocus?.focus()
  }
}, { immediate: true })
onBeforeUnmount(() => { cancelGeneration(); contextController?.abort() })
</script>

<template>
  <Teleport to="body">
    <Transition name="assistant-fade">
      <div v-if="showAITemplateModal" class="assistant-overlay" @keydown="handleKeys">
        <div class="assistant-backdrop" aria-hidden="true"></div>
        <section ref="modalRef" class="assistant-dialog" role="dialog" aria-modal="true" aria-labelledby="assistant-title" tabindex="-1">
          <header class="assistant-header">
            <div class="assistant-identity"><span class="assistant-logo"><Sparkles :size="22" /></span><div><div class="assistant-eyebrow">TURBO EDITOR <span>PRO</span></div><h2 id="assistant-title">Tu asistente de campañas</h2></div></div>
            <div class="header-end"><span class="draft-pill"><span></span>Espacio creativo</span><button type="button" class="icon-button" aria-label="Cerrar asistente" :disabled="applying" @click="close"><X :size="20" /></button></div>
          </header>
          <div class="assistant-layout">
            <aside class="assistant-sidebar" aria-label="Pasos del asistente">
              <div class="sidebar-intro"><span class="eyebrow">DE LA IDEA AL EMAIL</span><p>Una campaña<br><strong>con tu propia voz.</strong></p></div>
              <nav class="steps">
                <button v-for="(item, index) in steps" :key="item.title" type="button" class="step-item" :class="{ active: step === index, complete: step > index }" :disabled="busy || index > furthestStep + 1" :aria-current="step === index ? 'step' : undefined" @click="goTo(index)"><span class="step-number"><Check v-if="step > index" :size="15" /><template v-else>{{ index + 1 }}</template></span><span><strong>{{ item.title }}</strong><small>{{ item.hint }}</small></span><ChevronRight v-if="step === index" :size="15" class="step-arrow" /></button>
              </nav>
              <div class="sidebar-note"><ShieldCheck :size="18" /><p>Primero revisas la propuesta.<br>Al aplicarla, guardamos una nueva plantilla editable.</p></div>
              <div v-if="contextLoading" class="context-state" role="status"><Loader2 :size="14" class="spin" /> Recuperando tu identidad…</div>
              <div v-else-if="contextError" class="context-state context-warning"><span>{{ contextError }}</span><button type="button" @click="loadContext">Reintentar</button></div>
              <div v-else-if="brandAvailable" class="brand-chip"><span :style="{ background: context?.brand.colors?.primary || '#8b5cf6' }"></span>{{ context?.brand.name || 'Kit de marca disponible' }}</div>
            </aside>
            <div class="assistant-main">
              <div class="assistant-scroll" @input="formTouched = true">
                <div v-if="contextError" class="mobile-context-error" role="status"><span>{{ contextError }}</span><button type="button" @click="loadContext">Reintentar</button></div><div v-if="error" class="assistant-error" role="alert"><span>{{ error }}</span><button type="button" class="icon-button" aria-label="Ocultar error" @click="error = ''"><X :size="15" /></button></div>
                <div class="step-heading"><span class="eyebrow">PASO {{ step + 1 }} / 5</span><h3 ref="stepHeading" tabindex="-1">{{ ['¿Qué vamos a crear?', 'Hagamos que el mensaje importe.', 'Dale una dirección visual.', 'Una firma que ya te conoce.', draft ? 'Tu campaña empieza aquí.' : 'Todo listo para diseñar.'][step] }}</h3><p>{{ ['Cuéntame la idea. Construiremos el mensaje alrededor de tu objetivo y de las personas que lo van a recibir.', 'Los detalles concretos marcan la diferencia: qué ofreces, por qué interesa y cuál es el siguiente paso.', 'Elige una base del Editor Pro. La IA compondrá los módulos y adaptará el tono a tu campaña.', 'Recupera la identidad de una campaña anterior o ajusta los datos antes de generar.', draft ? 'Revisa el email, prueba ambos tamaños y pide los ajustes que necesites.' : 'Revisa tus decisiones. Crearemos una propuesta con los módulos reales del editor.'][step] }}</p></div>
                <fieldset v-if="step === 0" class="step-fields" :disabled="busy">
                  <label class="field"><span>¿Qué campaña quieres hacer? <b>*</b></span><textarea v-model="brief.campaign" maxlength="3000" rows="3" placeholder="Ej. Presentar nuestra nueva colección de otoño a clientes que ya conocen la marca." /></label>
                  <div class="suggestions"><button v-for="idea in campaignIdeas" :key="idea" type="button" @click="brief.campaign = idea; formTouched = true">{{ idea }}</button></div>
                  <label class="field"><span>¿Qué quieres conseguir? <b>*</b></span><input v-model="brief.objective" maxlength="600" placeholder="Ej. Conseguir reservas para una primera consulta" list="assistant-objectives"><datalist id="assistant-objectives"><option v-for="goal in objectives" :key="goal" :value="goal" /></datalist></label>
                  <label class="field"><span>¿A quién va dirigido? <b>*</b></span><textarea v-model="brief.audience" maxlength="1000" rows="2" placeholder="Ej. Responsables de marketing de pequeñas empresas; buscan ahorrar tiempo y ya han descargado nuestra guía." /></label>
                  <div class="insight"><Sparkles :size="17" /><p>Cuanto mejor describas a tu audiencia, más específicos serán los argumentos, los titulares y la llamada a la acción.</p></div>
                </fieldset>
                <fieldset v-else-if="step === 1" class="step-fields" :disabled="busy">
                  <label class="field"><span>¿Qué debe contar el email? <b>*</b></span><textarea v-model="brief.offer" maxlength="5000" rows="5" placeholder="Incluye los beneficios, productos, precios, fechas y condiciones reales. Puedes pegar aquí un resumen de tu oferta o del evento." /><small>La IA trabajará con estos datos. Incluye cifras y testimonios solo si son reales.</small></label>
                  <div class="field-row"><label class="field"><span>Texto del botón principal</span><input v-model="brief.ctaText" maxlength="100" placeholder="Reservar mi plaza"></label><label class="field"><span>Enlace de destino</span><input v-model="brief.ctaUrl" type="url" maxlength="2000" placeholder="https://tuweb.com/reservar"></label></div>
                  <label class="field"><span>Condiciones y cosas que debemos evitar <em>Opcional</em></span><textarea v-model="brief.constraints" maxlength="2500" rows="3" placeholder="Ej. Un email breve. Sin descuentos ni urgencia artificial. Incluir que las plazas están sujetas a disponibilidad." /></label>
                </fieldset>
                <fieldset v-else-if="step === 2" class="step-fields" :disabled="busy">
                  <div class="field"><span>¿Qué estilo representa mejor tu campaña?</span></div>
                  <div class="style-grid"><button v-for="style in editorStyleBases" :key="style.id" type="button" class="style-card" :class="{ selected: brief.styleId === style.id }" :aria-pressed="brief.styleId === style.id" @click="brief.styleId = style.id"><span class="style-miniature" :style="{ background: style.config.bodyBg }"><span class="mini-email" :style="{ background: style.config.contentBg, borderColor: style.config.borderColor }"><span class="mini-banner" :style="{ background: style.config.headerBg }"><i :style="{ background: style.config.headerText }"></i><i :style="{ background: style.config.headerText }"></i></span><span class="mini-line" :style="{ background: style.config.titleColor }"></span><span class="mini-line short" :style="{ background: style.config.subtitleColor }"></span><span class="mini-button" :style="{ background: style.config.accentColor, borderRadius: style.config.buttonRadius }"></span></span><span v-if="brief.styleId === style.id" class="style-check"><Check :size="12" /></span></span><strong>{{ t(style.name) }}</strong><small>{{ t(style.description) }}</small></button></div>
                  <div class="field-row"><label class="field"><span>Tono del texto</span><input v-model="brief.tone" maxlength="500" list="assistant-tones"><datalist id="assistant-tones"><option v-for="tone in tones" :key="tone" :value="tone" /></datalist></label><label class="field"><span>Idioma del email</span><select v-model="brief.language"><option value="es">Español</option><option value="en">English</option><option value="ca">Català</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="it">Italiano</option><option value="pt">Português</option></select></label></div>
                  <label class="field"><span>Tu dirección creativa <em>Opcional</em></span><textarea v-model="brief.visualDirection" maxlength="1500" rows="2" placeholder="Ej. Composición editorial con mucho aire, títulos contundentes y dos beneficios destacados. Puedes incluir URLs de imágenes propias." /></label>
                  <label class="check-field"><input v-model="brief.useBrandKit" type="checkbox"><span><strong>Usar mi kit de marca</strong><small>{{ brandAvailable ? 'Aplicar el logo, los colores y la tipografía guardados.' : 'Aplicar la identidad guardada si está disponible.' }}</small></span></label>
                </fieldset>
                <fieldset v-else-if="step === 3" class="step-fields" :disabled="busy">
                  <label class="field"><span>Origen de la firma</span><select :value="signatureSource" @change="chooseSignature(($event.target as HTMLSelectElement).value)"><optgroup v-if="context?.signatures.length" label="Identidades guardadas"><option v-for="candidate in context?.signatures" :key="candidate.id" :value="candidate.id">{{ candidate.signature.name || 'Firma' }} · {{ sourceLabel(candidate.sourceType) }}: {{ candidate.sourceName }}</option></optgroup><option value="new">Crear una firma nueva</option><option value="none">No incluir firma</option></select></label>
                  <div v-if="selectedSource && brief.includeSignature" class="signature-origin"><CheckCircle2 :size="18" /><div><strong>{{ signatureTouched ? 'Firma basada en tu historial' : 'Hemos recuperado tu firma más reciente' }}</strong><p>{{ sourceLabel(selectedSource.sourceType) }}: {{ selectedSource.sourceName }}<span v-if="selectedSource.updatedAt"> · {{ new Date(selectedSource.updatedAt).toLocaleDateString('es-ES') }}</span></p><small>Puedes corregir cualquier dato para esta propuesta.</small></div></div>
                  <template v-if="brief.includeSignature && brief.signature">
                    <div class="field-row"><label class="field"><span>Nombre de la persona o empresa</span><input v-model="brief.signature.name" maxlength="160" placeholder="Nombre y apellidos" @input="signatureTouched = true"></label><label class="field"><span>Cargo, empresa o descripción</span><input v-model="brief.signature.details" maxlength="600" placeholder="Equipo de atención · Mi empresa" @input="signatureTouched = true"></label></div>
                    <div class="field-row"><label class="field"><span>Email</span><input v-model="brief.signature.email" type="email" maxlength="254" placeholder="hola@tuempresa.com" @input="signatureTouched = true"></label><label class="field"><span>Teléfono</span><input v-model="brief.signature.phone" type="tel" maxlength="80" placeholder="+34 600 000 000" @input="signatureTouched = true"></label></div>
                    <label class="field"><span>Sitio web</span><input v-model="brief.signature.website" type="url" maxlength="2000" placeholder="https://tuempresa.com" @input="signatureTouched = true"></label>
                    <label class="field"><span>URL de la imagen o logo <em>Opcional</em></span><input v-model="brief.signature.imageUrl" maxlength="2000" placeholder="https://tuempresa.com/foto.jpg o /uploads/imagen.png" @input="signatureTouched = true"></label>
                    <label class="field"><span>Posdata <em>Opcional</em></span><textarea v-model="brief.signature.ps" maxlength="1000" rows="2" placeholder="Un último mensaje personal para cerrar el email." @input="signatureTouched = true" /></label>
                  </template>
                  <div v-else class="insight"><PencilLine :size="18" /><p>La propuesta cerrará con la llamada a la acción y el pie de preferencias y baja.</p></div>
                </fieldset>
                <div v-else class="review-step">
                  <template v-if="!draft">
                    <div class="brief-summary"><button v-for="item in summary" :key="item.label" type="button" :disabled="busy" @click="goTo(item.page)"><span><small>{{ item.label }}</small><strong>{{ item.value }}</strong></span><PencilLine :size="15" /></button></div>
                    <div class="creation-note"><div class="creation-icon"><WandSparkles :size="22" /></div><div><strong>Texto, composición y módulos en una sola propuesta.</strong><p>Recibirás un asunto, una vista previa y un diseño que podrás seguir editando bloque a bloque.</p></div></div>
                  </template>
                  <template v-else>
                    <div v-if="changedSinceDraft" class="changed-note" role="status">Has ajustado el brief. Genera de nuevo para incorporar los cambios antes de aplicar la propuesta.</div>
                    <div class="proposal-header"><div><span class="eyebrow">PROPUESTA CREATIVA</span><h4>{{ draft.name }}</h4></div><span class="module-badge">{{ draft.blocks.length }} módulos editables</span></div>
                    <div class="inbox-preview"><div><span>ASUNTO</span><strong>{{ draft.subject }}</strong><button type="button" class="icon-button" aria-label="Copiar asunto" @click="copyText(draft.subject)"><Copy :size="14" /></button></div><div><span>PREHEADER</span><p>{{ draft.preheader }}</p><button type="button" class="icon-button" aria-label="Copiar preheader" @click="copyText(draft.preheader)"><Copy :size="14" /></button></div></div>
                    <div class="preview-toolbar"><span>Vista previa</span><div class="device-switch"><button type="button" :class="{ active: previewMode === 'desktop' }" :aria-pressed="previewMode === 'desktop'" @click="previewMode = 'desktop'"><Monitor :size="14" /> Escritorio</button><button type="button" :class="{ active: previewMode === 'mobile' }" :aria-pressed="previewMode === 'mobile'" @click="previewMode = 'mobile'"><Smartphone :size="14" /> Móvil</button></div></div>
                    <div class="preview-stage"><iframe :srcdoc="previewDocument" sandbox="" referrerpolicy="no-referrer" title="Vista previa de la propuesta de email" tabindex="-1" :class="{ mobile: previewMode === 'mobile' }"></iframe></div>
                    <details class="proposal-details"><summary>Composición y decisiones de diseño <span>{{ outline.length }} módulos</span></summary><p>{{ draft.rationale || draft.text }}</p><ol><li v-for="(block, index) in outline" :key="`${block.id}-${index}`"><span>{{ String(index + 1).padStart(2, '0') }}</span>{{ block.name }}</li></ol></details>
                    <div v-if="draft.warnings?.length" class="proposal-warnings"><strong>Antes de usar esta campaña</strong><ul><li v-for="warning in draft.warnings" :key="warning">{{ warning }}</li></ul></div>
                    <fieldset class="refinement-box" :disabled="busy"><label for="assistant-refinement"><Sparkles :size="16" /> ¿Qué afinamos?</label><textarea id="assistant-refinement" v-model="refinement" maxlength="2500" rows="2" placeholder="Ej. Haz el titular más directo, acorta el texto y destaca el beneficio principal." /><div><span>Tu propuesta actual seguirá disponible si el ajuste falla.</span><button type="button" class="secondary-button" :disabled="!refinement.trim() || contextLoading" @click="generate(true)"><WandSparkles :size="15" /> Ajustar propuesta</button></div></fieldset>
                  </template>
                  <div v-if="generating" class="generation-status" role="status" aria-live="polite"><Loader2 :size="21" class="spin" /><div><strong>Diseñando tu campaña…</strong><p>Redactando el mensaje y componiendo los módulos del editor. Puede tardar un momento.</p></div><button type="button" @click="cancelGeneration">Cancelar</button></div>
                </div>
              </div>
              <footer class="assistant-footer">
                <button v-if="step > 0" type="button" class="back-button" :disabled="busy" @click="goTo(step - 1)"><ArrowLeft :size="16" /> Atrás</button><span v-else class="footer-hint">Tu idea. Tu marca. Tu email.</span>
                <div class="footer-actions"><button v-if="generating" type="button" class="secondary-button" @click="cancelGeneration">Cancelar</button><button v-if="step === 4 && draft && !generating" type="button" class="secondary-button regenerate-button" :disabled="busy || contextLoading" @click="generate()"><RefreshCw :size="15" /> {{ changedSinceDraft ? 'Actualizar propuesta' : 'Otra propuesta' }}</button><button v-if="step < 4" type="button" class="primary-button" :disabled="busy" @click="goTo(step + 1)">Continuar <ArrowRight :size="16" /></button><button v-else-if="!draft" type="button" class="primary-button" :disabled="busy || contextLoading" @click="generate()"><Loader2 v-if="generating" :size="17" class="spin" /><Sparkles v-else :size="17" /> {{ generating ? 'Creando propuesta…' : 'Crear mi campaña' }}</button><button v-else type="button" class="primary-button" :disabled="busy || changedSinceDraft || isTemplateLoading" @click="applyDraft"><Loader2 v-if="applying" :size="17" class="spin" /><Check v-else :size="17" /> {{ applying ? 'Guardando…' : 'Aplicar en el editor' }}</button></div>
              </footer>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mobile-context-error{display:none}
.assistant-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;color:#e8edf6}.assistant-backdrop{position:absolute;inset:0;background:rgba(3,7,18,.8);backdrop-filter:blur(12px)}.assistant-dialog{position:relative;width:min(1180px,100%);height:min(850px,92dvh);background:#101621;border:1px solid #2a3446;border-radius:22px;box-shadow:0 35px 100px #0009;display:flex;flex-direction:column;overflow:hidden;outline:none}
.assistant-header{padding:22px 28px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #273041;background:linear-gradient(110deg,#172036,#111723)}.assistant-identity,.header-end{display:flex;align-items:center;gap:14px}.assistant-logo{width:45px;height:45px;display:grid;place-items:center;border-radius:13px;background:linear-gradient(145deg,#7061f3,#8b5cf6);color:#fff;box-shadow:0 7px 22px #7c3aed38}.assistant-eyebrow{font-size:9px;letter-spacing:.16em;font-weight:700;color:#9da8c0}.assistant-eyebrow span{color:#c4b5fd;margin-left:4px}.assistant-header h2{margin:4px 0 0;font-size:19px;font-weight:650;letter-spacing:-.03em}.draft-pill{display:flex;gap:7px;align-items:center;color:#a7b4c7;font-size:11px;padding:7px 11px;background:#ffffff05;border:1px solid #354053;border-radius:30px}.draft-pill>span{width:5px;height:5px;border-radius:50%;background:#a78bfa}.icon-button{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;border:0;background:transparent;color:#98a7bd;border-radius:8px;cursor:pointer}.icon-button:hover{background:#ffffff0c;color:#fff}.icon-button:disabled{opacity:.35;cursor:wait}
.assistant-layout{display:grid;grid-template-columns:238px 1fr;min-height:0;flex:1}.assistant-sidebar{background:#111a2a;border-right:1px solid #263147;padding:28px 18px;display:flex;flex-direction:column;gap:24px;overflow:auto}.sidebar-intro{padding:0 12px}.eyebrow{font-size:9px;letter-spacing:.15em;color:#a99bff;font-weight:700}.sidebar-intro p{font-size:20px;line-height:1.45;letter-spacing:-.03em;margin:12px 0 4px;color:#aebbcf}.sidebar-intro strong{font-weight:600;color:#f3f5fa}.steps{display:flex;flex-direction:column;gap:7px}.step-item{display:flex;align-items:center;gap:11px;width:100%;background:transparent;border:1px solid transparent;border-radius:11px;padding:12px 11px;text-align:left;color:#9eacc3;cursor:pointer}.step-item strong{display:block;font-size:12px;font-weight:550}.step-item small{display:block;font-size:10px;margin-top:4px;color:#8190a8}.step-item.active{background:#8570ff12;border-color:#8570ff36;color:#f0edff}.step-item.active small{color:#ac9ff0}.step-number{width:27px;height:27px;border-radius:8px;border:1px solid #344059;display:grid;place-items:center;font-size:11px;flex-shrink:0}.active .step-number{background:#8b74fa;border-color:#8b74fa;color:white}.complete .step-number{color:#b8aaff;background:#7c5bf31a;border-color:#7c5bf330}.step-arrow{margin-left:auto;color:#b4a2ff}.step-item:disabled{cursor:default;opacity:.6}.sidebar-note{display:flex;gap:10px;border-top:1px solid #28334a;padding:20px 10px 0;margin-top:auto;color:#8f9fb9}.sidebar-note svg{flex-shrink:0;color:#a99bff;margin-top:2px}.sidebar-note p{margin:0;font-size:11px;line-height:1.7}.brand-chip{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#ffffff05;border:1px solid #2b354b;border-radius:9px;font-size:11px;overflow-wrap:anywhere}.brand-chip span{width:9px;height:9px;border-radius:50%;flex-shrink:0}.context-state{display:flex;gap:8px;font-size:11px;color:#a8b3c8;line-height:1.6;padding:0 8px}.context-warning{flex-direction:column}.context-warning button{background:none;border:0;color:#b9a9ff;text-align:left;padding:0;cursor:pointer}
.assistant-main{display:flex;flex-direction:column;min-width:0;min-height:0}.assistant-scroll{padding:30px 38px;flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#384155 transparent}.step-heading{margin-bottom:25px}.step-heading h3{font-size:25px;letter-spacing:-.045em;font-weight:600;line-height:1.2;margin:10px 0 10px;outline:none}.step-heading p{color:#97a7be;font-size:12px;line-height:1.8;max-width:640px;margin:0}.step-fields{border:0;padding:0;margin:0;min-width:0;display:flex;flex-direction:column;gap:20px}.field{display:flex;flex-direction:column;gap:8px;min-width:0;font-size:12px}.field>span{font-weight:550;color:#d3dceb}.field b{font-weight:400;color:#b69dff}.field em{font-size:10px;font-style:normal;color:#7e8da5;margin-left:6px;font-weight:400}.field input,.field textarea,.field select,.refinement-box textarea{width:100%;box-sizing:border-box;background:#0c131f;border:1px solid #303c52;border-radius:9px;padding:12px 13px;font:inherit;font-size:12px;color:#e9edf7;line-height:1.65;outline:none;transition:border-color .15s,box-shadow .15s;color-scheme:dark}.field input:focus,.field textarea:focus,.field select:focus,.refinement-box textarea:focus{border-color:#8e79eb;box-shadow:0 0 0 3px #8e79eb15}.field input::placeholder,.field textarea::placeholder,.refinement-box textarea::placeholder{color:#6f819c}.field textarea,.refinement-box textarea{resize:vertical;min-height:70px}.field small{font-size:10px;color:#8a9ab2;line-height:1.65}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.suggestions{display:flex;flex-wrap:wrap;gap:7px;margin-top:-9px}.suggestions button{background:#1a2335;border:1px solid #303a50;border-radius:20px;color:#b0bad0;padding:6px 10px;font-size:10px;cursor:pointer}.suggestions button:hover{border-color:#8e79eb;color:#ded6ff}.insight{display:flex;align-items:flex-start;gap:11px;padding:16px;border:1px solid #6961a533;background:#8070e108;border-radius:11px;color:#a99dcf}.insight svg{flex-shrink:0;margin-top:2px;color:#bdaaff}.insight p{font-size:11px;line-height:1.8;margin:0;color:#a5adc3}
.style-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:-7px}.style-card{text-align:left;padding:9px;border-radius:11px;border:1px solid #2c374b;background:#151e2d;cursor:pointer;color:#dbe2f2;overflow:hidden}.style-card.selected{border-color:#a78bfa;box-shadow:0 0 0 1px #a78bfa;background:#201e36}.style-card>strong{display:block;font-size:11px;margin:9px 3px 5px}.style-card>small{display:block;font-size:9px;color:#8e9db6;line-height:1.5;margin:0 3px 3px;min-height:27px}.style-miniature{height:90px;border-radius:5px;position:relative;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;padding:8px 17px 0}.mini-email{width:100%;height:81px;border:1px solid;border-bottom:0;box-shadow:0 3px 8px #0001;padding-bottom:7px}.mini-banner{display:flex;flex-direction:column;gap:4px;height:28px;padding:8px 9px;box-sizing:border-box}.mini-banner i{display:block;width:65%;height:3px;opacity:.8}.mini-banner i+i{width:45%;opacity:.4}.mini-line{display:block;height:3px;width:57%;margin:8px 9px 0;opacity:.7}.mini-line.short{width:75%;height:2px;margin-top:5px;opacity:.4}.mini-button{display:block;width:29%;height:9px;margin:8px 9px 0}.style-check{display:grid;place-items:center;position:absolute;right:5px;top:5px;background:#8b5cf6;border-radius:50%;width:19px;height:19px;color:#fff}.check-field{display:flex;align-items:flex-start;gap:10px;border:1px solid #303950;border-radius:10px;padding:14px;background:#ffffff02}.check-field input{accent-color:#a78bfa;margin-top:3px}.check-field strong{font-size:12px;font-weight:550}.check-field small{display:block;font-size:10px;color:#8f9eb6;margin-top:5px;line-height:1.6}.signature-origin{display:flex;gap:11px;padding:16px;background:#70d8b607;border:1px solid #70d8b625;border-radius:11px;color:#8fdec9}.signature-origin svg{flex-shrink:0}.signature-origin strong{font-size:12px;font-weight:550}.signature-origin p{font-size:11px;color:#a1b8bf;margin:6px 0;overflow-wrap:anywhere}.signature-origin small{font-size:10px;color:#8da2b5}
.brief-summary{border:1px solid #2e384c;border-radius:13px;overflow:hidden}.brief-summary button{display:flex;align-items:center;justify-content:space-between;text-align:left;gap:16px;border:0;border-bottom:1px solid #283246;background:#121b2a;color:#a99bff;padding:16px 18px;width:100%;cursor:pointer}.brief-summary button:last-child{border-bottom:0}.brief-summary button:hover{background:#1b2437}.brief-summary button small{display:block;font-size:10px;color:#8597b3;margin-bottom:6px}.brief-summary button strong{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;font-weight:450;line-height:1.7;color:#d5ddec;overflow-wrap:anywhere}.brief-summary button svg{flex-shrink:0}.creation-note{display:flex;gap:14px;padding:22px 0}.creation-icon{height:44px;width:44px;flex-shrink:0;display:grid;place-items:center;background:#8e79eb13;color:#b9a5ff;border-radius:12px}.creation-note strong{font-size:12px;font-weight:550}.creation-note p{font-size:11px;color:#8e9eb6;line-height:1.7;margin:7px 0 0}.changed-note,.assistant-error{background:#d0923010;border:1px solid #d0923045;border-radius:9px;padding:13px 15px;color:#e5c28b;font-size:11px;line-height:1.7;margin-bottom:18px}.assistant-error{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#e2646410;border-color:#e2646438;color:#ffc0c0}.proposal-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 18px}.proposal-header h4{font-size:18px;font-weight:550;margin:6px 0 0;letter-spacing:-.025em}.module-badge{font-size:10px;color:#b5a2f2;border:1px solid #8b74fa3a;border-radius:20px;padding:7px 10px;white-space:nowrap}.inbox-preview{border:1px solid #30394e;border-radius:10px;padding:7px 15px;background:#141d2c}.inbox-preview>div{display:grid;grid-template-columns:72px 1fr 24px;align-items:center;gap:8px;min-height:38px}.inbox-preview>div+div{border-top:1px solid #2a3548}.inbox-preview span{font-size:8px;letter-spacing:.1em;color:#8396b2}.inbox-preview strong,.inbox-preview p{font-size:11px;line-height:1.6;overflow-wrap:anywhere;margin:8px 0}.inbox-preview strong{font-weight:550}.inbox-preview p{color:#93a2ba}.preview-toolbar{display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px;font-size:11px;color:#a9b6cc}.device-switch{display:flex;background:#0a111c;border:1px solid #2b354a;border-radius:7px;padding:3px;gap:2px}.device-switch button{display:flex;align-items:center;gap:6px;font-size:10px;color:#899bb5;background:transparent;border:0;border-radius:5px;padding:6px 9px;cursor:pointer}.device-switch button.active{background:#2b2948;color:#d0c3ff}.preview-stage{display:flex;justify-content:center;background:repeating-linear-gradient(45deg,#162033,#162033 8px,#182336 8px,#182336 16px);border:1px solid #2e394e;border-radius:11px;padding:14px;overflow:hidden}.preview-stage iframe{border:0;display:block;background:white;width:100%;max-width:820px;height:480px;border-radius:2px;box-shadow:0 5px 20px #0003;transition:width .2s}.preview-stage iframe.mobile{width:375px;max-width:100%;border-radius:15px}.proposal-details{margin-top:16px;border:1px solid #2d374b;border-radius:10px;padding:14px}.proposal-details summary{font-size:11px;cursor:pointer;color:#bcc7db}.proposal-details summary>span{float:right;color:#8c9bb3;font-size:10px}.proposal-details>p{font-size:11px;color:#9daac0;line-height:1.75;margin:12px 0}.proposal-details ol{margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px;list-style:none}.proposal-details li{padding:6px 9px;font-size:10px;background:#ffffff05;border:1px solid #313c51;border-radius:6px;color:#bac5d9}.proposal-details li span{margin-right:7px;color:#9486ce;font-size:9px}.proposal-warnings{padding:15px;border-radius:10px;border:1px solid #d8ad5d33;background:#d8ad5d08;margin-top:15px}.proposal-warnings strong{font-size:11px;color:#d4bb8d}.proposal-warnings ul{padding-left:16px;margin:8px 0 0}.proposal-warnings li{font-size:11px;line-height:1.8;color:#b4aa96}.refinement-box{margin:20px 0 0;padding:16px;border:1px solid #7463be40;border-radius:12px;background:#8c6af907;min-width:0}.refinement-box label{display:flex;align-items:center;gap:8px;font-size:12px;color:#c3b6f7;margin-bottom:12px}.refinement-box>div{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}.refinement-box>div>span{font-size:9px;line-height:1.6;color:#8597b5;max-width:220px}.generation-status{margin-top:20px;display:flex;align-items:center;gap:14px;padding:17px;background:#8b74fa0d;border:1px solid #8b74fa40;border-radius:11px;color:#bdaaff}.generation-status svg{flex-shrink:0}.generation-status strong{font-size:12px}.generation-status p{font-size:10px;line-height:1.7;color:#9eacc3;margin:4px 0 0}.generation-status button{background:transparent;border:0;font-size:11px;color:#b9a9ee;cursor:pointer;margin-left:auto}
.assistant-footer{padding:18px 30px;border-top:1px solid #293247;background:#121a28;display:flex;align-items:center;justify-content:space-between;gap:12px}.footer-actions{display:flex;gap:10px;align-items:center;margin-left:auto}.footer-hint{color:#8192ad;font-size:10px}.primary-button,.secondary-button,.back-button{display:inline-flex;justify-content:center;align-items:center;gap:8px;padding:11px 15px;border-radius:8px;font-size:11px;font-weight:550;cursor:pointer;font-family:inherit;white-space:nowrap}.primary-button{background:#9a80fa;color:#131124;border:1px solid #b399ff;box-shadow:0 4px 15px #8b5cf61c}.primary-button:hover:not(:disabled){background:#b29bff}.secondary-button{border:1px solid #39445a;background:#1b2435;color:#c2cce0}.secondary-button:hover:not(:disabled){border-color:#8271bd;background:#242b42}.back-button{background:transparent;border:0;color:#96a7c1;padding:9px 0}.primary-button:disabled,.secondary-button:disabled,.back-button:disabled{opacity:.45;cursor:not-allowed}.assistant-dialog button:focus-visible{outline:2px solid #b79eff;outline-offset:3px}.spin{animation:assistant-spin 1s linear infinite}.assistant-fade-enter-active,.assistant-fade-leave-active{transition:opacity .16s}.assistant-fade-enter-from,.assistant-fade-leave-to{opacity:0}@keyframes assistant-spin{to{transform:rotate(360deg)}}
@media(min-width:1400px){.assistant-dialog{width:1240px}.assistant-layout{grid-template-columns:250px 1fr}.assistant-scroll{padding-left:44px;padding-right:44px}}
@media(max-width:850px){.assistant-overlay{padding:12px}.assistant-dialog{height:95dvh;border-radius:16px}.assistant-sidebar{padding:20px 10px}.assistant-layout{grid-template-columns:180px 1fr}.sidebar-intro{padding:0 7px}.sidebar-intro p{font-size:17px}.step-item{gap:8px;padding:10px 7px}.step-item strong{font-size:11px}.step-item small{font-size:9px}.step-arrow{display:none}.assistant-scroll{padding:25px}.style-grid{gap:9px}.style-card>small{display:none}.style-miniature{padding:8px 10px 0;height:76px}.mini-email{height:69px}.assistant-footer{padding:16px 22px}.draft-pill{display:none}.sidebar-note{padding-left:7px;padding-right:7px}.step-heading h3{font-size:23px}.regenerate-button{font-size:10px;padding:10px}.footer-actions{gap:7px}}
@media(max-width:620px){.mobile-context-error{display:block;border:1px solid #d0923045;padding:12px;border-radius:8px;color:#d4b57f;font-size:11px;line-height:1.6;margin-bottom:18px}.mobile-context-error button{display:block;color:#baa7ff;background:transparent;border:0;margin-top:8px;padding:0;cursor:pointer}.assistant-overlay{padding:0}.assistant-dialog{height:100dvh;width:100%;max-height:none;border-radius:0;border:0}.assistant-header{padding:15px 18px}.assistant-header h2{font-size:16px}.assistant-logo{width:37px;height:37px;border-radius:10px}.assistant-identity{gap:10px}.assistant-layout{display:flex;flex-direction:column}.assistant-sidebar{border-right:0;border-bottom:1px solid #293247;padding:10px 14px;overflow:visible;flex-shrink:0}.sidebar-intro,.sidebar-note,.brand-chip,.context-state{display:none}.steps{flex-direction:row;gap:5px}.step-item{justify-content:center;padding:6px 2px;flex:1;border-radius:8px;gap:0;flex-direction:column}.step-number{width:23px;height:23px;font-size:10px;border-radius:7px}.step-item strong{font-size:8px;white-space:nowrap;margin-top:6px;font-weight:500}.step-item small{display:none}.assistant-main{flex:1}.assistant-scroll{padding:24px 19px}.step-heading h3{font-size:23px}.step-heading p{font-size:11px}.field-row{grid-template-columns:1fr;gap:20px}.style-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.style-card{padding:6px}.style-card>strong{font-size:9px}.style-miniature{height:64px;padding:6px 5px 0}.mini-email{height:60px}.mini-banner{height:23px;padding:6px}.mini-line{margin-left:6px}.mini-button{margin:5px 6px 0;height:6px}.assistant-footer{padding:14px 16px;gap:8px}.footer-hint{font-size:9px}.primary-button{font-size:10px;padding:11px 12px}.secondary-button{font-size:10px;padding:9px 10px}.back-button{font-size:10px}.regenerate-button{max-width:130px;white-space:normal;line-height:1.35}.regenerate-button svg{display:none}.proposal-header{align-items:flex-start}.proposal-header h4{font-size:16px}.module-badge{font-size:8px;padding:6px}.preview-stage{padding:6px}.preview-stage iframe{height:430px}.inbox-preview{padding:6px 10px}.inbox-preview>div{grid-template-columns:57px 1fr 22px;gap:5px}.inbox-preview span{font-size:7px}.inbox-preview strong,.inbox-preview p{font-size:10px}.refinement-box{padding:13px}.refinement-box>div>span{display:none}.refinement-box>div{justify-content:flex-end}.proposal-details summary{font-size:10px}.proposal-details summary>span{display:none}.generation-status{gap:10px;padding:13px}.generation-status button{font-size:10px}}
@media(prefers-reduced-motion:reduce){.spin{animation:none}.assistant-fade-enter-active,.assistant-fade-leave-active,.preview-stage iframe{transition:none}}
</style>
