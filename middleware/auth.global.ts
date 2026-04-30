export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/unsubscribe' || to.path === '/resubscribe') return

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
    // Si no está autenticado, intentamos recuperar el último portal usado (para PWAs)
    if (process.client) {
      const config = useRuntimeConfig()
      const lastPortal = localStorage.getItem('last_portal')
      
      // Solo redireccionamos si el portal guardado coincide con el actual (seguridad)
      // Redirigimos incluso si está en '/' para que el PWA vuelva al login correcto
      if (lastPortal && lastPortal === config.public.portalKey && to.path !== '/login') {
        return navigateTo(`/login?portal=${lastPortal}`)
      }
    }

    if (to.path !== '/' && to.path !== '/login') {
      return navigateTo('/')
    }
  }
})
