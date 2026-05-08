// Fetches a CSRF token after login and attaches it to all mutating $fetch requests.
// Token is stored in a Nuxt state ref so it survives reactive updates.

export default defineNuxtPlugin(async () => {
  const csrfToken = useState<string>('csrfToken', () => '')

  async function refreshCsrfToken() {
    try {
      const { token } = await $fetch<{ token: string }>('/api/auth/csrf')
      csrfToken.value = token
    } catch {
      csrfToken.value = ''
    }
  }

  await refreshCsrfToken()

  // Intercept all $fetch calls to inject X-CSRF-Token header on mutating methods
  const nuxtApp = useNuxtApp()
  nuxtApp.hook('app:created', () => {
    globalThis.$fetch = $fetch.create({
      onRequest({ options }) {
        const method = (options.method ?? 'GET').toUpperCase()
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken.value) {
          options.headers = {
            ...options.headers as Record<string, string>,
            'X-CSRF-Token': csrfToken.value,
          }
        }
      },
    })
  })

  return {
    provide: {
      refreshCsrfToken,
    },
  }
})
