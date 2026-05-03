export default defineNuxtRouteMiddleware(async (to) => {
  // Setup wizard — only accessible when not installed
  if (to.path === '/setup') {
    const isInstalled = useState<boolean | null>('isInstalled', () => null)
    if (isInstalled.value === null) {
      try {
        const { installed } = await $fetch<{ installed: boolean }>('/api/setup/status')
        isInstalled.value = installed
      } catch {
        isInstalled.value = true
      }
    }
    if (isInstalled.value) return navigateTo('/dashboard')
    return
  }

  if (to.path === '/login') {
    if (process.client) {
      const config = useRuntimeConfig()
      if (config.public.ghostMode) {
        const lastPortal = localStorage.getItem('last_portal')
        if (lastPortal && lastPortal === config.public.portalKey && !to.query.portal) {
          return navigateTo(`/login?portal=${lastPortal}`)
        }
      }
    }
    return
  }

  if (to.path === '/unsubscribe' || to.path === '/resubscribe') return

  // Check setup status before auth
  const isInstalled = useState<boolean | null>('isInstalled', () => null)
  if (isInstalled.value === null) {
    try {
      const { installed } = await $fetch<{ installed: boolean }>('/api/setup/status')
      isInstalled.value = installed
    } catch {
      isInstalled.value = true
    }
  }
  if (!isInstalled.value) return navigateTo('/setup')

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
    if (process.client) {
      const config = useRuntimeConfig()
      const lastPortal = localStorage.getItem('last_portal')
      if (config.public.ghostMode && lastPortal && lastPortal === config.public.portalKey && to.path !== '/login') {
        return navigateTo(`/login?portal=${lastPortal}`)
      }
    }

    const config = useRuntimeConfig()
    if (config.public.ghostMode) {
      if (to.path !== '/login') {
        return navigateTo('/login')
      }
    } else {
      if (to.path !== '/' && to.path !== '/login') {
        return navigateTo('/')
      }
    }
  }
})
