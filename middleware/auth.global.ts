export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/unsubscribe') return

  const isAuthed = useState<boolean | null>('isAuthed', () => null)

  if (isAuthed.value === null) {
    try {
      await $fetch('/api/auth/check')
      isAuthed.value = true
    } catch {
      isAuthed.value = false
    }
  }

  if (!isAuthed.value) {
    return navigateTo('/login')
  }
})
