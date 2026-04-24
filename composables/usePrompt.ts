import { useEditorState } from '~/composables/useEditorState'

const { promptData, iframeRef } = useEditorState()

function openPrompt(
  title: string,
  label: string,
  initial: string,
  mode: 'text' | 'color' | 'font' | 'confirm',
  callback: (val: string) => void,
  variant: 'primary' | 'danger' = 'primary',
  confirmLabel?: string,
  colorTarget?: 'block' | 'text' | 'button',
) {
  promptData.title = title
  promptData.label = label
  promptData.value = initial
  promptData.mode = mode
  promptData.callback = callback
  promptData.variant = variant
  promptData.confirmLabel = confirmLabel ?? (useNuxtApp().$i18n as any).t('editor.prompt_apply')
  promptData.colorTarget = colorTarget ?? ''
  promptData.visible = true
}

function submitPrompt() {
  promptData.callback(promptData.value)
  promptData.visible = false

  if (promptData.mode !== 'confirm') {
    // Lazy import to avoid circular init — function called at runtime only
    import('~/composables/useIframeEngine').then(({ useIframeEngine }) => {
      useIframeEngine().triggerAutosave()
    })
  }

  const doc = iframeRef.value?.contentDocument
  if (doc) {
    doc.getSelection()?.removeAllRanges()
    const toolbar = doc.getElementById('floating-toolbar')
    if (toolbar) toolbar.style.display = 'none'
  }
}

function handlePromptInput(val: string) {
  if (promptData.mode !== 'color') return

  import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
    const { previewBlockColor, previewTextColor } = useBlockEditor()
    const { selectedSubElement } = useEditorState()

    if (promptData.colorTarget === 'text') {
      previewTextColor(val)
    } else if (promptData.colorTarget === 'block') {
      previewBlockColor(val)
    } else if (promptData.colorTarget === 'button') {
      const btn = selectedSubElement.value?.closest('[data-toggle="button"]') as HTMLElement
      if (btn) {
        const isValidHex = /^#([0-9A-F]{3}){1,2}$/i.test(val)
        if (isValidHex || val === 'transparent') {
          btn.style.background = val
        }
      }
    }
  })
}

export function usePrompt() {
  return { openPrompt, submitPrompt, handlePromptInput }
}
