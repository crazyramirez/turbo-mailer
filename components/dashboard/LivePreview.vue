<script setup lang="ts">
import { ref, watch } from 'vue'
import { nextTick } from 'vue'
import { Zap, Monitor, Copy, Check } from 'lucide-vue-next'
import { useDashboardState } from '~/composables/useDashboardState'

const { htmlBody, contactRows, personalizedPreviewHtml, subjectPreview, emailSubject, copied, showToast } =
  useDashboardState()

const previewIframe = ref<HTMLIFrameElement | null>(null)

// Update iframe whenever personalized HTML changes
watch(
  personalizedPreviewHtml,
  async () => {
    await nextTick()
    const iframe = previewIframe.value
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(
        `<style>body { overflow-x: hidden !important; margin: 0; word-break: break-word; } img { max-width: 100% !important; height: auto !important; }</style>` +
          personalizedPreviewHtml.value,
      )
      doc.close()
    }
  },
  { immediate: true },
)

async function copyHtml() {
  const iframe = previewIframe.value
  if (!iframe) return
  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) return

  try {
    const clone = doc.documentElement.cloneNode(true) as HTMLElement
    const titleEl = clone.querySelector('title')
    if (titleEl) titleEl.remove()

    const blobHtml = new Blob([clone.outerHTML], { type: 'text/html' })
    const blobText = new Blob([doc.body.innerText], { type: 'text/plain' })
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })])

    copied.value = true
    showToast('Diseño copiado para Gmail', 'success')
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Fallback: select + execCommand
    try {
      const win = iframe.contentWindow
      if (win) {
        win.focus()
        const selection = win.getSelection()
        const range = doc.createRange()
        range.selectNodeContents(doc.body)
        selection?.removeAllRanges()
        selection?.addRange(range)
        doc.execCommand('copy')
        selection?.removeAllRanges()

        copied.value = true
        showToast('Diseño copiado para Gmail', 'success')
        setTimeout(() => (copied.value = false), 2000)
      }
    } catch {
      showToast('Error al copiar diseño', 'error')
    }
  }
}
</script>

<template>
  <div class="preview-side">
    <div class="sticky-preview-container">
      <div v-if="htmlBody" class="preview-window">
        <div class="preview-header-bar">
          <div class="preview-user-info">
            <div class="avatar-mini">
              <Zap :size="16" class="avatar-icon-pro" />
            </div>
            <div class="preview-titles">
              <span class="preview-label">Live Preview</span>
              <span class="preview-recipient-pill">Para: {{ contactRows[0]?.email || 'ejemplo@correo.com' }}</span>
            </div>
          </div>
          <button @click="copyHtml" class="btn-copy-preview" title="Copiar HTML para Gmail">
            <Copy :size="16" v-if="!copied" />
            <Check :size="16" v-else />
            <span>{{ copied ? '¡Copiado!' : 'Copiar HTML' }}</span>
          </button>
        </div>

        <div class="preview-email-meta">
          <div class="meta-row">
            <span class="meta-label">Asunto:</span>
            <span class="meta-value">{{ subjectPreview || emailSubject || '(Sin asunto)' }}</span>
          </div>
        </div>

        <div class="preview-viewport">
          <iframe ref="previewIframe" class="preview-frame" sandbox="allow-same-origin"></iframe>
        </div>
      </div>

      <div v-else class="empty-preview-state">
        <div class="preview-placeholder-art">
          <Monitor :size="40" stroke-width="1.5" />
        </div>
        <h3>Esperando Diseño</h3>
        <p>Carga una plantilla HTML para ver la personalización en tiempo real aquí.</p>
      </div>
    </div>
  </div>
</template>
