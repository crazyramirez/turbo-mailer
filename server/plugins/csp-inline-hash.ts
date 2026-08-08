import { createHash } from 'node:crypto'
import { registerInlineScriptHashes, getAppCsp } from '~/server/utils/csp'

/**
 * Collects CSP hashes for Nuxt's inline bootstrap script.
 *
 * Nuxt (ssr:false) still emits one inline <script> that assigns
 * window.__NUXT__.config. It has no nonce and is assembled by the renderer at
 * request time, so there is no file on disk to hash at startup — without an
 * allowance for it, `script-src 'self'` blocks it and the SPA never boots.
 *
 * `render:html` fires while the response headers are still mutable, so the
 * hash is registered before security-headers stamps the policy for this same
 * request. The script is byte-identical across routes and requests, so this
 * effectively runs once and every later response reuses the cached policy.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event }) => {
    const fragments = [
      ...(html.head ?? []),
      ...(html.bodyPrepend ?? []),
      ...(html.bodyAppend ?? []),
    ]

    const hashes: string[] = []
    for (const fragment of fragments) {
      if (typeof fragment !== 'string') continue
      for (const [, attrs, body] of fragment.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
        // Only inline executable scripts need a hash.
        if (/\ssrc=/i.test(attrs)) continue
        if (/type\s*=\s*["'](?:application\/json|importmap|speculationrules)["']/i.test(attrs)) continue
        if (!body.trim()) continue
        hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
      }
    }

    if (hashes.length) registerInlineScriptHashes(hashes)

    // Re-stamp the header for THIS response. The security-headers middleware
    // already ran, so on the very first document after a restart it wrote a
    // policy that did not yet include this hash — which would have blocked the
    // bootstrap script and served a blank app to the first visitor.
    if (event && !event.node.res.headersSent) {
      event.node.res.setHeader('Content-Security-Policy', getAppCsp())
    }
  })
})
