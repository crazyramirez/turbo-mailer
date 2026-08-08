// Content-Security-Policy for the app itself.
//
// Kept separate from the middleware so the render:html plugin can feed it the
// hash of Nuxt's inline bootstrap script (see server/plugins/csp-inline-hash.ts).
//
// Routes needing different rules set their own CSP header later — setHeader
// replaces rather than appends. /api/templates?preview=1 does exactly that.

const inlineScriptHashes = new Set<string>()
let cachedCsp: string | null = null

/** Adds CSP source hashes for inline scripts; invalidates the cached policy. */
export function registerInlineScriptHashes(hashes: string[]): void {
  let added = false
  for (const hash of hashes) {
    if (!inlineScriptHashes.has(hash)) {
      inlineScriptHashes.add(hash)
      added = true
    }
  }
  if (added) cachedCsp = null
}

export function getAppCsp(): string {
  if (cachedCsp) return cachedCsp

  const scriptSrc = ["'self'", ...inlineScriptHashes].join(' ')

  cachedCsp = [
    "default-src 'self'",

    // Bundled .js files plus the hashed inline bootstrap.
    // No 'unsafe-inline', no 'unsafe-eval'.
    `script-src ${scriptSrc}`,

    // Vue injects component styles as inline <style> blocks at runtime, and the
    // editor writes inline style attributes constantly. 'unsafe-inline' is
    // unavoidable for styles; it is far lower risk than for scripts.
    "style-src 'self' 'unsafe-inline'",

    // Email templates legitimately reference images on arbitrary hosts (logos,
    // CDNs, placehold.co, flaticon...). Locking this down would break the
    // editor preview for real-world templates.
    "img-src 'self' data: blob: https: http:",

    "font-src 'self' data:",

    // Same-origin API only: the server makes the outbound calls (SMTP,
    // webhooks, AI), never the browser.
    "connect-src 'self'",

    // Service worker (@vite-pwa) is served from our own origin.
    "worker-src 'self' blob:",
    "manifest-src 'self'",

    // The editor renders templates in a same-origin/blank iframe.
    "frame-src 'self' blob:",

    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return cachedCsp
}
