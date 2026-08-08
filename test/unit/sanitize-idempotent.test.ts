import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { sanitizeEmailHtml } from '~/server/utils/html-sanitize'

// Regression guard: sanitizing must be stable. Templates are re-sanitized on
// every autosave and on every preview, so a non-idempotent rule would slowly
// corrupt real templates on disk.
describe('sanitizeEmailHtml on real templates', () => {
  const dirs = ['data/templates', 'data/demo'].map(d => path.resolve(process.cwd(), d))
  const files = dirs.flatMap(dir => {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(f => f.endsWith('.html')).map(f => path.join(dir, f))
  })

  // One assertion loop rather than a test-per-file: the template directory is
  // user data, so a test count derived from it changes as templates come and go.
  it('is idempotent and non-destructive across every template on disk', () => {
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const original = fs.readFileSync(file, 'utf-8')
      const once = sanitizeEmailHtml(original)
      const twice = sanitizeEmailHtml(once)

      expect(twice, `not idempotent: ${path.basename(file)}`).toBe(once)
      // A real template must survive essentially intact.
      expect(
        once.length,
        `sanitizing destroyed content in ${path.basename(file)}`,
      ).toBeGreaterThan(original.length * 0.95)
    }
  })
})
