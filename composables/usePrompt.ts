import { useEditorState } from '~/composables/useEditorState'

const { promptData, iframeRef, selectedElement } = useEditorState()

function openPrompt(
  title: string,
  label: string,
  initial: string,
  mode: 'text' | 'color' | 'font' | 'confirm',
  callback: (val: string) => void,
  variant: 'primary' | 'danger' = 'primary',
  confirmLabel?: string,
  colorTarget?: 'block' | 'text' | 'button' | 'border',
) {
  promptData.title = title
  promptData.label = label
  promptData.value = initial
  promptData.mode = mode
  promptData.callback = callback
  promptData.variant = variant
  promptData.confirmLabel = confirmLabel ?? (useNuxtApp().$i18n as any).t('editor.prompt_apply')
  promptData.colorTarget = colorTarget ?? ''
  promptData.initialValue = initial
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

function cancelPrompt() {
  if (promptData.mode === 'color') {
    handlePromptInput(promptData.initialValue)
  }
  promptData.visible = false
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
    } else if (promptData.colorTarget === 'border') {
      import('~/composables/useBlockEditor').then(({ useBlockEditor }) => {
        useBlockEditor().previewBorderColor(val)
      })
    }
  })
}

export function usePrompt() {
  return { openPrompt, submitPrompt, handlePromptInput, cancelPrompt }
}
