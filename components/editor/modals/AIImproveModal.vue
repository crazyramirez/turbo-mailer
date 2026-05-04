<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Sparkles, MessageSquare, Lightbulb } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useToast } from '~/composables/useToast'

const { aiImproveModal } = useEditorState()
const { showToast } = useToast()
const isImproving = ref(false)

const cleanedHtml = computed(() => {
  const target = aiImproveModal.targetEl
  if (!target) return ''
  const clone = target.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.visor-drag-handle').forEach(el => el.remove())
  return clone.innerHTML
})

function close() {
  if (isImproving.value) return
  aiImproveModal.visible = false
  aiImproveModal.context = ''
}

async function handleImprove() {
  const target = aiImproveModal.targetEl
  if (!target) return

  const textToImprove = cleanedHtml.value
  const context = aiImproveModal.context

  isImproving.value = true
  showToast('Optimizando texto con Inteligencia Artificial...', 'info')
  target.classList.add('ai-improving')

  try {
    const { improvedText } = await $fetch<{ improvedText: string }>('/api/ai/improve', {
      method: 'POST',
      body: { text: textToImprove, context }
    })

    if (improvedText) {
      target.innerHTML = improvedText
      showToast('Texto optimizado con éxito', 'success')

      // Direct deselection from useEditorState
      const { selectedElement, selectedSubElement, activePanel, iframeRef } = useEditorState()
      if (selectedElement.value) {
        selectedElement.value.classList.remove('selected')
        selectedElement.value = null
      }
      selectedSubElement.value = null
      activePanel.value = 'layers'

      const doc = iframeRef.value?.contentDocument
      if (doc) {
        doc.getSelection()?.removeAllRanges()
        const toolbar = doc.getElementById('floating-toolbar')
        if (toolbar) toolbar.style.display = 'none'
      }

      isImproving.value = false
      aiImproveModal.visible = false
      aiImproveModal.context = ''

      // Add premium animation on the content with delay
      setTimeout(() => {
        target.classList.add('block-updated-glow')
        setTimeout(() => {
          target.classList.remove('block-updated-glow')
        }, 2400)
      }, 350)

      import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
        useIframeEngine().refreshLayers()
        useIframeEngine().triggerAutosave(true)
      })
    }
  } catch (err: any) {
    showToast(err.statusMessage || 'Error al conectar con la IA', 'error')
  } finally {
    isImproving.value = false
    target.classList.remove('ai-improving')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="aiImproveModal.visible" class="modal-overlay high-z-ai-improve">
        <div class="modal-backdrop" @click="close"></div>
        <div class="modal-window ai-improve-modal-window">
          <div class="modal-header">
            <div class="header-info">
              <div class="header-tag">
                <Sparkles :size="12" class="sparkles-mini" />
                <span>Premium Copywriting</span>
              </div>
              <h2>Optimizar texto con IA</h2>
              <p>Dale a la IA instrucciones o contexto adicional para obtener mejores resultados</p>
            </div>
            <button @click="close" class="btn-close-minimal">
              <X :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <div class="improve-content">
              <!-- Content preview -->
              <div class="original-preview-box">
                <label><MessageSquare :size="14" /> Contenido original del bloque</label>
                <div class="original-text-content" v-html="cleanedHtml || 'Sin contenido'"></div>
              </div>

              <!-- Context Input -->
              <div class="context-input-box">
                <label><Lightbulb :size="14" /> Contexto o instrucciones adicionales</label>
                <textarea
                  v-model="aiImproveModal.context"
                  placeholder="Ej: Hazlo sonar más convincente, profesional y enfocado en aumentar las ventas. O indícale el público objetivo o tono deseado."
                  class="premium-textarea custom-scrollbar"
                  rows="4"
                  autofocus
                  @keydown.shift.enter.prevent="handleImprove"
                ></textarea>
              </div>
            </div>

            <div class="modal-footer-actions">
              <button @click="close" class="btn-modal-secondary" :disabled="isImproving">
                {{ $t('editor.image_modal_cancel') || 'Cancelar' }}
              </button>
              <button 
                @click="handleImprove" 
                class="premium-button ai-improve-button"
                :disabled="isImproving"
              >
                <Sparkles v-if="!isImproving" :size="16" />
                <span v-else class="anim-spin spinner-sm"></span>
                <span>{{ isImproving ? 'Optimizando...' : 'Optimizar con IA' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.modal-overlay.high-z-ai-improve {
  z-index: 12000 !important; /* Extremely high to sit on top of regular overlays */
}
</style>

<style scoped>
.ai-improve-modal-window {
  width: 520px;
  max-width: 95vw;
  padding: 28px;
  background: #111116;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 60px rgba(99, 102, 241, 0.15);
  display: flex;
  flex-direction: column;
}

.header-info h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 4px 0 6px 0;
  background: linear-gradient(135deg, #ffffff, #a5b4fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-info p {
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.5;
  margin: 0;
}

.header-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(99, 102, 241, 0.1);
  color: #818cf8;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(99, 102, 241, 0.2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sparkles-mini {
  color: #c7d2fe;
}

.improve-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 20px 0 24px 0;
}

.original-preview-box, .context-input-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.original-preview-box label, .context-input-box label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}

.original-preview-box label svg, .context-input-box label svg {
  color: #818cf8;
}

.original-text-content {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px;
  color: #ffffff;
  font-size: 14px;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.5;
}

.original-text-content :deep(*) {
  color: #ffffff !important;
}

.premium-textarea {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.5;
  width: 100%;
  outline: none;
  resize: vertical;
  transition: all 0.2s ease;
}

.premium-textarea:focus {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.1);
}

.modal-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-modal-secondary {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.btn-modal-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.15);
}

.ai-improve-button {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #ffffff;
  padding: 10px 24px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.ai-improve-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #4f46e5, #4338ca);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.4);
}

.ai-improve-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.anim-spin {
  animation: spin 1s linear infinite;
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff;
  border-top-color: transparent;
  border-radius: 50%;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
