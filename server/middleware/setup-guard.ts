import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ALLOWED_PREFIXES = [
  '/api/setup',
  '/api/health',
  '/api/track/',
  '/api/unsubscribe',
  '/api/resubscribe',
  '/api/subscribe',
  '/api/preferences',
]

// Cached only once installed. A `false` result must never be cached: the setup
// wizard creates the sentinel in the same process, and a sticky `false` would
// 503 every API call — including login — until the server was restarted.
let _installed = false

/** Called by the setup wizard the moment the sentinel is written. */
export function markInstalled(): void {
  _installed = true
}

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (ALLOWED_PREFIXES.some(p => path.startsWith(p))) return

  if (!_installed) {
    _installed = existsSync(resolve(process.cwd(), 'data/.installed'))
  }

  if (!_installed) {
    throw createError({ statusCode: 503, message: 'Setup required — visit /setup to configure TurboMailer' })
  }
})
