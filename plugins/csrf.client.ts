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
      async onRequest({ request, options }) {
        const method = (options.method ?? 'GET').toUpperCase()
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return

        // The startup fetch fails when the app loads unauthenticated (login
        // screen): recover lazily on the first mutating request post-login.
        const url = typeof request === 'string' ? request : (request as Request).url
        if (!csrfToken.value && !url.includes('/api/auth/')) {
          await refreshCsrfToken()
        }

        if (csrfToken.value) {
          const headers = new Headers(options.headers as HeadersInit | undefined)
          headers.set('X-CSRF-Token', csrfToken.value)
          options.headers = headers
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
