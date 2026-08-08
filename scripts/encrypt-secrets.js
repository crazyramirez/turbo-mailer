#!/usr/bin/env node
/**
 * Encrypts plaintext secrets in data/config.json in place.
 *
 * Installs created before the setup wizard (or edited by hand) keep SMTP/IMAP
 * passwords, the OpenAI key and the DKIM private key as plaintext on disk.
 * The app reads those fine — decryptField() passes non-"enc:" values through —
 * but there is no reason to leave them readable.
 *
 * It also ensures ENCRYPTION_KEY exists in .env. Without it the key is derived
 * from the machine hostname, so every "enc:" value becomes undecryptable the
 * moment the host is renamed or the install is moved to another server.
 *
 *   node scripts/encrypt-secrets.js            # apply
 *   node scripts/encrypt-secrets.js --dry-run  # show what would change
 *
 * A timestamped backup of both files is written before anything is modified.
 */
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { hostname } from 'node:os'

const ALGO = 'aes-256-gcm'
const SALT = 'turbomailer-config-v1'
const ENC_PREFIX = 'enc:'

// Must match server/utils/serverConfig.ts
const ENCRYPTED_FIELDS = ['smtpPass', 'imapPass', 'openaiApiKey', 'dkimPrivateKey', 'webhookSecret']

const root = process.cwd()
const configPath = resolve(root, 'data/config.json')
const envPath = resolve(root, '.env')
const dryRun = process.argv.includes('--dry-run')

function encryptField(plain, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function readEnvValue(text, name) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'))
  return m ? m[1].trim() : null
}

if (!existsSync(configPath)) {
  console.error(`No config found at ${configPath} — nothing to do.`)
  process.exit(1)
}

const config = JSON.parse(readFileSync(configPath, 'utf-8'))
let envText = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''

// ── 1. ENCRYPTION_KEY ───────────────────────────────────────────────────────
let encryptionKey = process.env.ENCRYPTION_KEY || readEnvValue(envText, 'ENCRYPTION_KEY')
let generatedKey = false

if (!encryptionKey) {
  encryptionKey = randomBytes(32).toString('hex')
  generatedKey = true
  console.log('ENCRYPTION_KEY missing — generating a new one.')
} else {
  console.log('ENCRYPTION_KEY already set — reusing it.')
}

// Values already encrypted under the OLD key (the hostname) must be decrypted
// with that key before being re-encrypted, or they become unrecoverable.
const alreadyEncrypted = ENCRYPTED_FIELDS.filter(
  (f) => typeof config[f] === 'string' && config[f].startsWith(ENC_PREFIX),
)
if (alreadyEncrypted.length && generatedKey) {
  console.error('')
  console.error('REFUSING TO CONTINUE.')
  console.error(`These fields are already encrypted: ${alreadyEncrypted.join(', ')}`)
  console.error('They were encrypted with a key derived from the hostname')
  console.error(`("${hostname()}"). Introducing a new ENCRYPTION_KEY now would make them`)
  console.error('permanently unreadable.')
  console.error('')
  console.error('Fix: add this line to .env, restart, and re-run this script:')
  console.error(`  ENCRYPTION_KEY=${hostname()}`)
  process.exit(1)
}

const key = scryptSync(encryptionKey, SALT, 32)

// ── 2. Encrypt plaintext secrets ────────────────────────────────────────────
const toEncrypt = ENCRYPTED_FIELDS.filter(
  (f) => typeof config[f] === 'string' && config[f] && !config[f].startsWith(ENC_PREFIX),
)

console.log('')
for (const field of ENCRYPTED_FIELDS) {
  const v = config[field]
  if (v === undefined) console.log(`  ${field.padEnd(16)} (absent)`)
  else if (String(v).startsWith(ENC_PREFIX)) console.log(`  ${field.padEnd(16)} already encrypted`)
  else console.log(`  ${field.padEnd(16)} PLAINTEXT -> will encrypt (${String(v).length} chars)`)
}

if (!toEncrypt.length && !generatedKey) {
  console.log('\nNothing to do.')
  process.exit(0)
}

if (dryRun) {
  console.log('\n--dry-run: no files written.')
  process.exit(0)
}

// ── 3. Backup, then write ───────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
copyFileSync(configPath, `${configPath}.${stamp}.bak`)
if (existsSync(envPath)) copyFileSync(envPath, `${envPath}.${stamp}.bak`)
console.log(`\nBackups written with suffix .${stamp}.bak`)

for (const field of toEncrypt) {
  config[field] = encryptField(String(config[field]), key)
}
writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
console.log(`Encrypted ${toEncrypt.length} field(s) in data/config.json`)

if (generatedKey) {
  if (!envText.endsWith('\n') && envText.length) envText += '\n'
  envText +=
    `\n# Key used to encrypt secrets in data/config.json (AES-256-GCM).\n` +
    `# Without it the key falls back to the machine hostname, so renaming the\n` +
    `# host or moving the install makes every "enc:" value unreadable.\n` +
    `# BACK THIS UP. Losing it means re-entering every secret.\n` +
    `ENCRYPTION_KEY=${encryptionKey}\n`
  writeFileSync(envPath, envText, 'utf-8')
  console.log('Added ENCRYPTION_KEY to .env — back it up.')
}

// The .env copies of these secrets are only a fallback for when config.json is
// absent; config.json wins. Flag them so they are not mistaken for live values.
const staleEnvSecrets = ['SMTP_PASS', 'IMAP_PASS', 'OPENAI_API_KEY', 'DKIM_PRIVATE_KEY'].filter(
  (n) => {
    const v = readEnvValue(envText, n)
    return v && !v.startsWith(ENC_PREFIX) && !v.startsWith('"' + ENC_PREFIX)
  },
)
if (staleEnvSecrets.length) {
  console.log('')
  console.log('Note: .env still holds plaintext copies of:', staleEnvSecrets.join(', '))
  console.log('config.json takes priority, so these are unused fallbacks.')
  console.log('Clear them by hand if you want no plaintext secrets on disk at all.')
}

console.log('\nDone. Restart the app.')
