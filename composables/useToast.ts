import { useEditorState } from '~/composables/useEditorState'

const { toast } = useEditorState()

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  toast.message = message
  toast.type = type
  toast.visible = true
  setTimeout(() => (toast.visible = false), 3000)
}

export function useToast() {
  return { showToast }
}
