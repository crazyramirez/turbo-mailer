import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const SALT = 'turbomailer-config-v1'
const ENC_PREFIX = 'enc:'

function getDerivedKey(): Buffer {
  const base = process.env.ENCRYPTION_KEY || require('node:os').hostname()
  return scryptSync(base, SALT, 32)
}

/**
 * Encrypts a plaintext string → "enc:iv:tag:ciphertext" (all hex).
 * Uses AES-256-GCM with a key derived from ENCRYPTION_KEY env var.
 */
export function encryptField(plain: string): string {
  if (!plain) return plain
  const key = getDerivedKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts an "enc:iv:tag:ciphertext" string back to plaintext.
 * Legacy values (not starting with "enc:") are returned as-is for backwards compatibility.
 */
export function decryptField(encoded: string): string {
  if (!encoded || !encoded.startsWith(ENC_PREFIX)) return encoded
  try {
    const rest = encoded.slice(ENC_PREFIX.length)
    const [ivHex, tagHex, dataHex] = rest.split(':')
    if (!ivHex || !tagHex || !dataHex) return encoded
    const key = getDerivedKey()
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    return encoded
  }
}
