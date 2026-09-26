<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { X, Sparkles, Send, Loader2 } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useTemplateManager } from '~/composables/useTemplateManager'
import { useToast } from '~/composables/useToast'
import { assembleEmail, type PlannedBlock } from '~/utils/emailAssembler'

const { showAITemplateModal, currentTemplate, htmlContent } = useEditorState()
const { saveTemplate, loadTemplates } = useTemplateManager()
const { showToast } = useToast()

const messages = ref<{role: 'assistant' | 'user', content: string}[]>([
  { role: 'assistant', content: '¡Hola! Soy tu asistente de diseño. ¿Qué tipo de campaña de email te gustaría crear hoy? (Ej: Newsletter, Captación de clientes, Venta de producto...)' }
])
const inputMessage = ref('')
const isLoading = ref(false)
const chatContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const autoResize = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 125) + 'px'
  }
}

watch(showAITemplateModal, (newVal) => {
  if (!newVal) {
    inputMessage.value = ''
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  }
})

const scrollToBottom = async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return

  const userMsg = inputMessage.value.trim()
  inputMessage.value = ''
  
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }

  messages.value.push({ role: 'user', content: userMsg })
  isLoading.value = true
  await scrollToBottom()

  try {
    const response = await $fetch('/api/ai/generate-template', {
      method: 'POST',
      body: { messages: messages.value }
    })

    if (response.type === 'question') {
      messages.value.push({ role: 'assistant', content: response.text })
      await scrollToBottom()
    } else if (response.type === 'template') {
      messages.value.push({ role: 'assistant', content: '¡Generando tu plantilla y adaptando los estilos!' })
      await scrollToBottom()
      
      // Aplicar plantilla y esperar a que las imágenes IA se generen
      await applyGeneratedTemplate(response)
      
      setTimeout(() => {
        showAITemplateModal.value = false
        showToast('Plantilla completada con éxito', 'success')
      }, 1500)
    }
  } catch (err: any) {
    showToast(err.message || 'Error al conectar con la IA', 'error')
  } finally {
    isLoading.value = false
  }
}

const applyGeneratedTemplate = async (data: any) => {
  // Shared assembler: same markup as the two-click generator, brand kit
  // colours applied, unsubscribe link always preserved
  const brand = await $fetch<any>('/api/brand-kit').catch(() => null)
  const blocks: PlannedBlock[] = (Array.isArray(data.blocks) ? data.blocks : []).map((b: any) => {
    const r = b.replacements || {}
    return {
      id: b.id,
      fields: {
        title: r.title, subtitle: r.subtitle, badge: r.badge, button: r.button,
        contact: r.contact, ps: r.ps, images: r.image, logo: r.logo,
      },
    }
  })

  let announced = false
  const finalHtml = await assembleEmail({
    blocks,
    styleId: data.styleId || 'default',
    brand: brand && (brand.name || brand.logoUrl) ? brand : null,
    language: brand?.language || 'es',
    resolveImage: async (ref: string) => {
      if (!/^https?:\/\//i.test(ref)) return null
      if (!ref.includes('pollinations.ai')) return ref
      if (!announced) {
        announced = true
        messages.value.push({ role: 'assistant', content: '🖼️ Pintando imágenes con IA y guardándolas en tu biblioteca...' })
        await scrollToBottom()
      }
      try {
        const uploadRes = await $fetch<any>('/api/ai/download-image', { method: 'POST', body: { url: ref } })
        return uploadRes?.url ?? null
      } catch (e) {
        console.error('Error descargando la imagen de IA', e)
        return null
      }
    },
  })

  htmlContent.value = finalHtml

  // Siempre guardar como una nueva plantilla para no sobrescribir la actual
  currentTemplate.value = 'Plantilla_IA_' + Date.now().toString().slice(-5)

  // Inyectar el HTML directamente en el lienzo para que se vea la imagen de inmediato
  import('~/composables/useIframeEngine').then(m => m.useIframeEngine().injectIframeContent())

  // Guardar con un delay de 2 segundos para asegurar que el DOM ha cargado
  setTimeout(async () => {
    await saveTemplate(true)
    await loadTemplates()
  }, 2000)
}
</script>

<template>
  <Transition name="fade">
    <div v-if="showAITemplateModal" class="modal-overlay premium-overlay">
      <div class="modal-backdrop"></div>
      <div class="ai-modal-glass">
        <!-- Glowing animated background inside modal -->
        <div class="glass-glow"></div>
        
        <div class="premium-header">
          <div class="header-info">
            <div class="icon-box">
              <Sparkles :size="18" class="text-indigo-400" />
            </div>
            <div>
              <h2>Generador IA</h2>
              <p>Diseño asistido perfecto</p>
            </div>
          </div>
          <button @click="showAITemplateModal = false" class="btn-close-glass">
            <X :size="18" />
          </button>
        </div>
        
        <div class="chat-layout">
          <div class="chat-messages" ref="chatContainer">
            <div 
              v-for="(msg, index) in messages" 
              :key="index"
              :class="['chat-bubble', msg.role === 'assistant' ? 'assistant' : 'user']"
            >
              {{ msg.content }}
            </div>
            <div v-if="isLoading" class="chat-bubble assistant typing">
              <Loader2 :size="14" class="animate-spin" /> <span>Analizando...</span>
            </div>
          </div>
          
          <div class="chat-input-wrapper">
            <div class="chat-input-box">
              <textarea 
                ref="textareaRef"
                v-model="inputMessage" 
                placeholder="Ej: Newsletter de verano..." 
                @keydown.enter.shift.prevent="sendMessage"
                @input="autoResize"
                :disabled="isLoading"
                rows="1"
              ></textarea>
              <button @click="sendMessage" :disabled="isLoading || !inputMessage.trim()" class="btn-send-glass">
                <Send :size="16" />
              </button>
            </div>
            <div class="input-hint">Shift + Enter para enviar</div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.premium-overlay {
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ai-modal-glass {
  position: relative;
  z-index: 20;
  width: 100%;
  max-width: 440px;
  height: 580px;
  max-height: 85vh;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 32px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass-glow {
  position: absolute;
  top: -20%;
  left: -20%;
  width: 140%;
  height: 140%;
  background: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

.premium-header {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 14px;
}

.icon-box {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(79, 70, 229, 0.05));
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
}

.header-info h2 {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 2px 0;
  letter-spacing: -0.01em;
  font-family: "Outfit", sans-serif;
}

.header-info p {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

.btn-close-glass {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close-glass:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  transform: scale(1.05);
}

.chat-layout {
  position: relative;
  z-index: 10;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-messages::-webkit-scrollbar {
  width: 4px;
}
.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.chat-bubble {
  max-width: 85%;
  padding: 14px 18px;
  font-size: 13.5px;
  line-height: 1.5;
  animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(10px);
}

.chat-bubble.assistant {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
  align-self: flex-start;
  border-radius: 20px 20px 20px 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.chat-bubble.user {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: white;
  align-self: flex-end;
  border-radius: 20px 20px 4px 20px;
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.2);
}

.chat-bubble.typing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #818cf8;
  font-weight: 500;
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 8px 12px;
}

.chat-input-wrapper {
  padding: 0 24px 24px 24px;
}

.chat-input-box {
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 6px;
  transition: all 0.3s;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.chat-input-box:focus-within {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1), inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.chat-input-box textarea {
  flex: 1;
  background: transparent;
  border: none;
  padding: 8px 16px;
  color: #fff;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  resize: none;
  min-height: 38px;
  max-height: 125px;
  overflow-y: auto;
  font-family: inherit;
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.chat-input-box textarea::-webkit-scrollbar {
  display: none;
}

.chat-input-box textarea::placeholder {
  color: #64748b;
}

.input-hint {
  font-size: 11px;
  color: #64748b;
  text-align: center;
  margin-top: 8px;
}

.btn-send-glass {
  background: #6366f1;
  color: white;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send-glass:hover:not(:disabled) {
  background: #4f46e5;
  transform: scale(1.05);
}

.btn-send-glass:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes modalPop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
