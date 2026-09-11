import { setResponseHeader, type H3Event } from 'h3'

export default defineNitroPlugin((nitroApp) => {
  const applyPrivacy = (event: H3Event) => {
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
  }
  // Errors can bypass beforeResponse. Set headers before authentication runs too.
  nitroApp.hooks.hook('request', applyPrivacy)
  nitroApp.hooks.hook('beforeResponse', applyPrivacy)
})
