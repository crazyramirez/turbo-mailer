import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { encryptField, decryptField } from '~/server/utils/encryption'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf-8')

describe('encryption (setup wizard dependency)', () => {
  // The wizard encrypts every secret it stores. getDerivedKey() previously used
  // a bare require('node:os') which throws ReferenceError in the ESM Nitro
  // build — the whole install failed with a 500 whenever ENCRYPTION_KEY was
  // unset, i.e. on every default deployment.
  it('never uses require() — the server bundle is ESM', () => {
    // Strip comments first: the explanatory note in that file mentions
    // require() by name, and only real code matters here.
    const code = read('server/utils/encryption.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\brequire\s*\(/)
    expect(code).toMatch(/import .*from 'node:os'/)
  })

  it('round-trips a secret without ENCRYPTION_KEY set', () => {
    const original = process.env.ENCRYPTION_KEY
    delete process.env.ENCRYPTION_KEY
    try {
      const enc = encryptField('smtp-p4ssw0rd')
      expect(enc.startsWith('enc:')).toBe(true)
      expect(enc).not.toContain('smtp-p4ssw0rd')
      expect(decryptField(enc)).toBe('smtp-p4ssw0rd')
    } finally {
      if (original !== undefined) process.env.ENCRYPTION_KEY = original
    }
  })

  it('passes legacy plaintext values through unchanged', () => {
    expect(decryptField('plain-value')).toBe('plain-value')
  })
})

describe('setup-guard', () => {
  const src = read('server/middleware/setup-guard.ts')

  // A cached `false` made every API call 503 after a successful install —
  // including login — until the process was restarted.
  it('never caches the not-installed state', () => {
    expect(src).not.toMatch(/_installed\s*:\s*boolean\s*\|\s*null/)
    expect(src).toMatch(/let _installed = false/)
  })

  it('exposes markInstalled so the wizard can flip it in-process', () => {
    expect(src).toMatch(/export function markInstalled/)
  })

  it('re-checks the sentinel while still uninstalled', () => {
    expect(src).toMatch(/if \(!_installed\) \{\s*\n\s*_installed = existsSync/)
  })
})

describe('setup complete endpoint', () => {
  const src = read('server/api/setup/complete.post.ts')

  it('validates password length server-side', () => {
    expect(src).toMatch(/String\(password\)\.length < 8/)
  })

  it('validates the tracking URL scheme server-side', () => {
    expect(src).toMatch(/new URL\(String\(app\.trackingBaseUrl\)\)/)
    expect(src).toMatch(/protocol !== 'http:' && .*protocol !== 'https:'/)
  })

  it('validates the SMTP port range', () => {
    expect(src).toMatch(/smtpPort < 1 \|\| smtpPort > 65535/)
  })

  it('creates the data directory before writing into it', () => {
    expect(src).toMatch(/mkdirSync\(resolve\(process\.cwd\(\), 'data'\), \{ recursive: true \}\)/)
    // mkdir must come before the first write, otherwise a fresh clone fails.
    expect(src.indexOf('mkdirSync')).toBeLessThan(src.indexOf("writeFileSync(\n    resolve(process.cwd(), 'data/config.json')"))
  })

  it('clears both caches so no restart is needed', () => {
    expect(src).toMatch(/invalidateServerConfig\(\)/)
    expect(src).toMatch(/markInstalled\(\)/)
  })

  it('writes the sentinel only after the config and env files', () => {
    expect(src.indexOf("'data/config.json'")).toBeLessThan(src.indexOf('sentinelPath, new Date()'))
    expect(src.indexOf("resolve(process.cwd(), '.env')")).toBeLessThan(src.indexOf('sentinelPath, new Date()'))
  })

  it('terminates .env with a newline', () => {
    expect(src).toMatch(/envLines\.join\('\\n'\) \+ '\\n'/)
  })

  it('hashes the password and stores only a hashed API key', () => {
    expect(src).toMatch(/bcrypt\.hash\(String\(password\), 12\)/)
    expect(src).toMatch(/hashApiKey\(rawApiSecret\)/)
  })

  it('encrypts every stored secret', () => {
    for (const field of ['smtp.pass', 'advanced.openaiApiKey', 'advanced.dkimPrivateKey']) {
      const name = field.split('.')[1]
      expect(src, `${name} must be encrypted`).toMatch(new RegExp(`encryptField\\(String\\(${field.replace('.', '\\.')}`))
    }
  })

  it('refuses to run twice', () => {
    expect(src).toMatch(/existsSync\(sentinelPath\)/)
    expect(src).toMatch(/statusCode: 403/)
  })
})

describe('setup wizard page', () => {
  const src = read('pages/setup.vue')

  it('validates the tracking URL with URL(), not startsWith("http")', () => {
    expect(src).not.toMatch(/trackingBaseUrl\.value\.startsWith\("http"\)/)
    expect(src).toMatch(/new URL\(trackingBaseUrl\.value\.trim\(\)\)/)
  })

  it('sends the user straight to login without a restart step', () => {
    expect(src).toMatch(/function goToLogin/)
    expect(src).not.toMatch(/checkRestart/)
    expect(src).not.toMatch(/done_restart_title/)
  })
})
