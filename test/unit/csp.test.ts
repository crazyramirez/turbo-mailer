import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getAppCsp, registerInlineScriptHashes } from '~/server/utils/csp'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf-8')

const directive = (csp: string, name: string) =>
  csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ') || s === name) ?? ''

describe('app CSP', () => {
  const csp = getAppCsp()

  it('locks down the dangerous fetch directives', () => {
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
  })

  it('never allows inline or evaluated scripts', () => {
    const scriptSrc = directive(csp, 'script-src')
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
    expect(scriptSrc).toContain("'self'")
  })

  it('allows inline styles — Vue and the editor require them', () => {
    // Documented trade-off: style-src is the one place 'unsafe-inline' stays.
    expect(directive(csp, 'style-src')).toContain("'unsafe-inline'")
  })

  it('permits remote images so real email templates still render', () => {
    const imgSrc = directive(csp, 'img-src')
    expect(imgSrc).toContain('https:')
    expect(imgSrc).toContain('data:')
  })

  it('restricts network calls to our own origin', () => {
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
  })
})

describe('inline script hash registration', () => {
  beforeEach(() => {
    // getAppCsp caches; registering a new hash must invalidate that cache.
    registerInlineScriptHashes(["'sha256-TESTHASHVALUE='"])
  })

  it('adds registered hashes to script-src', () => {
    expect(directive(getAppCsp(), 'script-src')).toContain("'sha256-TESTHASHVALUE='")
  })

  it('is idempotent — re-registering does not duplicate', () => {
    registerInlineScriptHashes(["'sha256-TESTHASHVALUE='"])
    const occurrences = getAppCsp().split("'sha256-TESTHASHVALUE='").length - 1
    expect(occurrences).toBe(1)
  })
})

describe('CSP wiring', () => {
  it('security-headers sets the app policy', () => {
    const src = read('server/middleware/security-headers.ts')
    expect(src).toMatch(/setHeader\(event, 'Content-Security-Policy', getAppCsp\(\)\)/)
  })

  it('the render:html plugin re-stamps the header for the first response', () => {
    // Without this, the very first document after a restart carries a policy
    // computed before the bootstrap script's hash was known — blocking it and
    // serving a blank app to the first visitor.
    const src = read('server/plugins/csp-inline-hash.ts')
    expect(src).toMatch(/render:html/)
    expect(src).toMatch(/headersSent/)
    expect(src).toMatch(/setHeader\('Content-Security-Policy', getAppCsp\(\)\)/)
  })

  it('the template preview keeps its own stricter policy', () => {
    const src = read('server/api/templates.ts')
    expect(src).toMatch(/PREVIEW_CSP/)
    expect(src).toMatch(/default-src 'none'/)
  })
})

describe('secret storage', () => {
  it('documents ENCRYPTION_KEY in .env.example', () => {
    const example = read('.env.example')
    expect(example).toMatch(/^ENCRYPTION_KEY=/m)
    expect(example).toMatch(/hostname/i)
  })

  it('gitignores the plaintext backups the migration writes', () => {
    const ignore = read('.gitignore')
    expect(ignore).toMatch(/data\/config\.json\.\*\.bak/)
    expect(ignore).toMatch(/\.env\.\*\.bak/)
  })

  it('refuses to re-key values already encrypted under the hostname', () => {
    // Generating a fresh ENCRYPTION_KEY over hostname-encrypted values would
    // make them permanently unreadable.
    const script = read('scripts/encrypt-secrets.js')
    expect(script).toMatch(/REFUSING TO CONTINUE/)
    expect(script).toMatch(/alreadyEncrypted\.length && generatedKey/)
  })

  it('backs up both files before writing', () => {
    const script = read('scripts/encrypt-secrets.js')
    expect(script).toMatch(/copyFileSync\(configPath/)
    expect(script).toMatch(/copyFileSync\(envPath/)
  })
})
