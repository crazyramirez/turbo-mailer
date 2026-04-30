<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { X, Sparkles, Send, Loader2 } from 'lucide-vue-next'
import { useEditorState } from '~/composables/useEditorState'
import { useTemplateManager } from '~/composables/useTemplateManager'
import { useToast } from '~/composables/useToast'
import { editorBlocks } from '~/utils/editorBlocks'

const { showAITemplateModal, currentTemplate, htmlContent, currentStyle } = useEditorState()
const { saveTemplate } = useTemplateManager()
const { showToast } = useToast()

const messages = ref<{role: 'assistant' | 'user', content: string}[]>([
  { role: 'assistant', content: '¡Hola! Soy tu asistente de diseño. ¿Qué tipo de campaña de email te gustaría crear hoy? (Ej: Newsletter, Captación de clientes, Venta de producto...)' }
])
const inputMessage = ref('')
const isLoading = ref(false)
const chatContainer = ref<HTMLElement | null>(null)

const scrollToBottom = async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return

  const userMsg = inputMessage.value.trim()
  messages.value.push({ role: 'user', content: userMsg })
  inputMessage.value = ''
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
  // Configurar estilo base
  currentStyle.value = data.styleId || 'default'
  
  let newBlocksHtml = ''
  
  if (data.blocks && Array.isArray(data.blocks)) {
    // Necesitamos usar un for clásico para poder usar await secuencialmente en el mapeo
    for (const b of data.blocks) {
      const blockDef = editorBlocks.find(eb => eb.id === b.id)
      if (blockDef) {
        let content = blockDef.content
        
        // Reemplazar textos e imágenes usando DOMParser
        if (b.replacements && typeof b.replacements === 'object') {
          const parser = new DOMParser()
          const doc = parser.parseFromString(content, 'text/html')
          
          for (const [key, val] of Object.entries(b.replacements)) {
            const els = Array.from(doc.querySelectorAll(`[data-toggle="${key}"]`))
            for (let index = 0; index < els.length; index++) {
              const el = els[index]
              const value = Array.isArray(val) ? (val[index] || val[0]) : val
              if (!value) continue
              
              if (key === 'image' || key === 'logo') {
                let imgUrl = value as string
                
                // Si la imagen viene de pollinations o es externa, la descargamos y subimos al servidor
                if (imgUrl.includes('pollinations.ai')) {
                  // Mostrar mensaje en el chat para avisar del progreso
                  messages.value.push({ role: 'assistant', content: '🖼️ Pintando imagen con IA y forzando recurso local...' })
                  await scrollToBottom()
                  
                  try {
                    const response = await fetch(imgUrl)
                    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`)
                    
                    const contentType = response.headers.get('content-type')
                    if (!contentType || !contentType.startsWith('image/')) {
                      throw new Error(`Invalid content type: ${contentType}`)
                    }
                    
                    const blob = await response.blob()
                    const formData = new FormData()
                    formData.append('files', blob, `ai_img_${Date.now()}.jpg`)
                    
                    const uploadRes = await $fetch<any[]>('/api/uploads', {
                      method: 'POST',
                      body: formData
                    })
                    
                    if (uploadRes && uploadRes.length > 0) {
                      imgUrl = uploadRes[0].url
                    }
                  } catch (e) {
                    console.error('Error procesando la imagen de IA', e)
                  }
                }
                
                const img = el.querySelector('img')
                if (img) img.src = imgUrl
                else if (el.tagName.toLowerCase() === 'img') (el as HTMLImageElement).src = imgUrl
                
              } else if (key === 'button') {
                const span = el.querySelector('.btn-text')
                if (span) span.innerHTML = value as string
                else el.innerHTML = value as string
              } else {
                el.innerHTML = value as string
              }
            }
          }
          content = doc.body.innerHTML
        }
        
        newBlocksHtml += content
      }
    }
  }

  // Generar un HTML completo mínimo para inyectar en el iframe
  const finalHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <style>
    body { 
      margin: 0; padding: 0; font-family: Arial, sans-serif; 
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    .main-card {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      border-radius: 0px;
      box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
    @media only screen and (max-width: 600px) {
      .main-card { border-radius: 0px !important; }
      .header-block, .body-block, .methodology-block, .presence-block, .card-block, .cta-block, .signature-block {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .grid-quad-td {
        display: inline-block !important;
        width: 50% !important;
        box-sizing: border-box !important;
        padding: 4px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;" data-style-id="${data.styleId || 'default'}">
  <div style="margin:0;padding:0;width:100%;">
    <div style="margin:0 auto;padding: 0px;">
      <div class="main-card" style="width:100%;max-width:820px;margin:0 auto;border: 1px solid #e9e9e9;border-radius:0px;box-shadow:0 10px 40px rgba(15, 23, 42, 0.08);overflow:hidden;">
        ${newBlocksHtml}
      </div>
    </div>
  </div>
</body>
</html>`

  htmlContent.value = finalHtml
  
  // Siempre guardar como una nueva plantilla para no sobrescribir la actual
  currentTemplate.value = 'Plantilla_IA_' + Date.now().toString().slice(-5)
  
  // Inyectar el HTML directamente en el lienzo para que se vea la imagen de inmediato
  import('~/composables/useIframeEngine').then(m => m.useIframeEngine().injectIframeContent())
  
  // Guardar con un delay de 2 segundos para asegurar que el DOM ha cargado
  setTimeout(() => {
    saveTemplate(true)
  }, 2000)
}
</script>

<template>
  <Transition name="fade">
    <div v-if="showAITemplateModal" class="modal-overlay premium-overlay">
      <div class="modal-backdrop" @click="showAITemplateModal = false"></div>
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
            <div class="chat-input-pill">
              <input 
                v-model="inputMessage" 
                type="text" 
                placeholder="Ej: Newsletter de verano..." 
                @keyup.enter="sendMessage"
                :disabled="isLoading"
              />
              <button @click="sendMessage" :disabled="isLoading || !inputMessage.trim()" class="btn-send-glass">
                <Send :size="16" />
              </button>
            </div>
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

.chat-input-pill {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 99px;
  padding: 6px;
  transition: all 0.3s;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.chat-input-pill:focus-within {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1), inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.chat-input-pill input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0 16px;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.chat-input-pill input::placeholder {
  color: #64748b;
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
