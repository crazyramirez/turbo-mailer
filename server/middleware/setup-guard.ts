import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ALLOWED_PREFIXES = [
  '/api/setup',
  '/api/health',
  '/api/track/',
  '/api/unsubscribe',
  '/api/resubscribe',
  '/api/subscribe',
]

let _installed: boolean | null = null

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (ALLOWED_PREFIXES.some(p => path.startsWith(p))) return

  if (_installed === null) {
    _installed = existsSync(resolve(process.cwd(), 'data/.installed'))
  }

  if (!_installed) {
    throw createError({ statusCode: 503, message: 'Setup required — visit /setup to configure TurboMailer' })
  }
})
