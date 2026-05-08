import { onMounted, onUnmounted, ref } from 'vue'

interface Shortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  description: string
  action: () => void
}

const shortcuts = ref<Shortcut[]>([])
const showHelp = ref(false)
let registered = false

function handler(e: KeyboardEvent) {
  // Don't fire when typing in inputs/textareas
  const tag = (e.target as HTMLElement)?.tagName
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || (e.target as HTMLElement)?.isContentEditable

  if (e.key === '?' && !isEditing) {
    showHelp.value = !showHelp.value
    return
  }
  if (e.key === 'Escape') {
    showHelp.value = false
    return
  }

  for (const s of shortcuts.value) {
    const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey)
    const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey
    if (e.key === s.key && ctrlMatch && shiftMatch && !isEditing) {
      e.preventDefault()
      s.action()
      return
    }
    if (e.key === s.key && s.ctrl && (e.ctrlKey || e.metaKey) && isEditing) {
      e.preventDefault()
      s.action()
      return
    }
  }
}

export function useKeyboardShortcuts(defs: Shortcut[]) {
  onMounted(() => {
    shortcuts.value = [...shortcuts.value, ...defs]
    if (!registered) {
      window.addEventListener('keydown', handler)
      registered = true
    }
  })

  onUnmounted(() => {
    const keys = new Set(defs.map(d => d.key + d.ctrl + d.shift))
    shortcuts.value = shortcuts.value.filter(s => !keys.has(s.key + s.ctrl + s.shift))
    if (shortcuts.value.length === 0) {
      window.removeEventListener('keydown', handler)
      registered = false
    }
  })

  return { showHelp }
}
