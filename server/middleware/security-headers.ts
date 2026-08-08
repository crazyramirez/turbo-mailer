import { getAppCsp } from '~/server/utils/csp'

export default defineEventHandler((event) => {
  setHeader(event, 'X-Frame-Options', 'DENY')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'X-XSS-Protection', '1; mode=block')
  setHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  setHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  // App-wide default. Handlers that need stricter rules (template preview)
  // overwrite this header with their own policy.
  setHeader(event, 'Content-Security-Policy', getAppCsp())
})
