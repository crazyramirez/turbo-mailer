import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — what every authenticator app speaks.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** New random 160-bit secret, base32 encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS)
}

/**
 * Checks a code against the current step ±1 (clock drift). Returns the
 * matching step, or null. Steps ≤ lastStep are rejected so a code seen by
 * a shoulder-surfer can't be reused inside its validity window.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null = null, now = Date.now()): number | null {
  const clean = String(code).replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const step = currentStep(now)
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue
    const expected = Buffer.from(totpCode(secret, s))
    if (timingSafeEqual(expected, Buffer.from(clean))) return s
  }
  return null
}

export function otpauthUri(secret: string, account: string, issuer = 'TurboMailer'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}
