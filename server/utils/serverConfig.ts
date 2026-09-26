import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { decryptField, encryptField } from '~/server/utils/encryption'
import { dataDir } from './data-dir'

export { dataDir }

let _cache: Record<string, any> | null = null

// Top-level fields that may be AES-256-GCM encrypted in config.json
const ENCRYPTED_FIELDS = new Set([
  'smtpPass', 'imapPass', 'openaiApiKey', 'dkimPrivateKey', 'webhookSecret',
  'anthropicApiKey', 'aiApiKey', 's3SecretKey', 'alertTelegramToken',
  'turnstileSecret', 'postmasterToken', 'backupPassphrase', 'metricsToken',
])

// Arrays of objects whose `pass`-like members are encrypted individually
const ENCRYPTED_NESTED: Record<string, string[]> = {
  smtpProfiles: ['pass', 'dkimPrivateKey'],
  seedMailboxes: ['pass'],
}

function configPath(): string {
  return resolve(dataDir, 'config.json')
}

function decryptAll(raw: Record<string, any>): Record<string, any> {
  for (const field of ENCRYPTED_FIELDS) {
    if (typeof raw[field] === 'string') raw[field] = decryptField(raw[field])
  }
  for (const [key, members] of Object.entries(ENCRYPTED_NESTED)) {
    if (!Array.isArray(raw[key])) continue
    raw[key] = raw[key].map((item: any) => {
      if (!item || typeof item !== 'object') return item
      const copy = { ...item }
      for (const m of members) if (typeof copy[m] === 'string') copy[m] = decryptField(copy[m])
      return copy
    })
  }
  return raw
}

function getFileConfig(): Record<string, any> {
  if (_cache) return _cache
  const p = configPath()
  if (!existsSync(p)) { _cache = {}; return _cache }
  const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any>
  // Decrypt sensitive fields transparently (legacy plaintext values pass through unchanged)
  _cache = decryptAll(raw)
  return _cache
}

export function invalidateServerConfig(): void {
  _cache = null
}

// Maps runtimeConfig field names → env var names (fallback when config.json absent)
const ENV_MAP: Record<string, string> = {
  appPassword:           'APP_PASSWORD',
  smtpHost:              'SMTP_HOST',
  smtpPort:              'SMTP_PORT',
  smtpUser:              'SMTP_USER',
  smtpPass:              'SMTP_PASS',
  smtpSecure:            'SMTP_SECURE',
  smtpFromName:          'SMTP_FROM_NAME',
  smtpFromEmail:         'SMTP_FROM_EMAIL',
  smtpReplyTo:           'SMTP_REPLY_TO',
  trackingBaseUrl:       'TRACKING_BASE_URL',
  unsubscribeSecret:     'UNSUBSCRIBE_SECRET',
  apiSecret:             'API_SECRET',
  smtpSendDelayMs:       'SMTP_SEND_DELAY_MS',
  smtpSendJitterMs:      'SMTP_SEND_JITTER_MS',
  smtpMaxRetries:        'SMTP_MAX_RETRIES',
  smtpRetryDelayMs:      'SMTP_RETRY_DELAY_MS',
  smtpMaxEmailsPerSecond:'SMTP_MAX_EMAILS_PER_SECOND',
  smtpMaxConnections:    'SMTP_MAX_CONNECTIONS',
  smtpConcurrency:       'SMTP_CONCURRENCY',
  bounceAddress:         'BOUNCE_ADDRESS',
  openaiApiKey:          'OPENAI_API_KEY',
  openaiModel:           'OPENAI_MODEL',
  aiProvider:            'AI_PROVIDER',
  anthropicApiKey:       'ANTHROPIC_API_KEY',
  anthropicModel:        'ANTHROPIC_MODEL',
  aiBaseUrl:             'AI_BASE_URL',
  aiApiKey:              'AI_API_KEY',
  aiModel:               'AI_MODEL',
  dkimDomain:            'DKIM_DOMAIN',
  dkimSelector:          'DKIM_SELECTOR',
  dkimPrivateKey:        'DKIM_PRIVATE_KEY',
  doubleOptIn:           'DOUBLE_OPT_IN',
  webhookUrl:            'WEBHOOK_URL',
  webhookSecret:         'WEBHOOK_SECRET',
  imapAutoDetect:        'IMAP_AUTO_DETECT',
  imapHost:              'IMAP_HOST',
  imapPort:              'IMAP_PORT',
  imapUser:              'IMAP_USER',
  imapPass:              'IMAP_PASS',
  imapTls:               'IMAP_TLS',
  spamCheckUrl:          'SPAM_CHECK_URL',
  metricsToken:          'METRICS_TOKEN',
  alertSlackWebhook:     'ALERT_SLACK_WEBHOOK',
  alertTelegramToken:    'ALERT_TELEGRAM_TOKEN',
  alertTelegramChatId:   'ALERT_TELEGRAM_CHAT_ID',
  alertEmail:            'ALERT_EMAIL',
  s3Endpoint:            'S3_ENDPOINT',
  s3Region:              'S3_REGION',
  s3Bucket:              'S3_BUCKET',
  s3AccessKey:           'S3_ACCESS_KEY',
  s3SecretKey:           'S3_SECRET_KEY',
  turnstileSiteKey:      'TURNSTILE_SITE_KEY',
  turnstileSecret:       'TURNSTILE_SECRET',
  companyAddress:        'COMPANY_ADDRESS',
}

export function useServerConfig(): Record<string, any> {
  const fc = getFileConfig()
  return new Proxy({} as Record<string, any>, {
    get(_, prop: string) {
      const fromFile = fc[prop]
      if (fromFile !== undefined && fromFile !== null && fromFile !== '') return fromFile
      const envKey = ENV_MAP[prop]
      if (envKey) return process.env[envKey]
      return undefined
    },
  })
}

/** Truthy config flag, whether it came from JSON (boolean) or env ("true"). */
export function configFlag(config: Record<string, any>, key: string, fallback = false): boolean {
  const v = config[key]
  if (v === undefined || v === null || v === '') return fallback
  if (typeof v === 'boolean') return v
  return String(v).toLowerCase() === 'true' || String(v) === '1'
}

/** Numeric config value with a fallback for empty/invalid values. */
export function configNumber(config: Record<string, any>, key: string, fallback: number): number {
  const v = config[key]
  if (v === undefined || v === null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function encryptAll(obj: Record<string, any>): Record<string, any> {
  const out = { ...obj }
  for (const field of ENCRYPTED_FIELDS) {
    if (typeof out[field] === 'string' && out[field] && !out[field].startsWith('enc:')) {
      out[field] = encryptField(out[field])
    }
  }
  for (const [key, members] of Object.entries(ENCRYPTED_NESTED)) {
    if (!Array.isArray(out[key])) continue
    out[key] = out[key].map((item: any) => {
      if (!item || typeof item !== 'object') return item
      const copy = { ...item }
      for (const m of members) {
        if (typeof copy[m] === 'string' && copy[m] && !copy[m].startsWith('enc:')) copy[m] = encryptField(copy[m])
      }
      return copy
    })
  }
  return out
}

/**
 * Merges `patch` into data/config.json. Keys set to `undefined` are left
 * untouched, `null` deletes them. Sensitive fields are encrypted on the way
 * in. Written atomically (tmp + rename) so a crash never leaves half a file.
 */
export function writeServerConfig(patch: Record<string, any>): void {
  const p = configPath()
  const current = existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any> : {}
  const decrypted = decryptAll({ ...current })
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (v === null) delete decrypted[k]
    else decrypted[k] = v
  }
  const next = encryptAll(decrypted)
  mkdirSync(dataDir, { recursive: true })
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8')
  renameSync(tmp, p)
  invalidateServerConfig()
}

/** Raw (decrypted) file config — for settings screens that need the real shape. */
export function readFileConfig(): Record<string, any> {
  return { ...getFileConfig() }
}

export function isSensitiveConfigKey(key: string): boolean {
  return ENCRYPTED_FIELDS.has(key) || key === 'appPassword' || key === 'apiSecret' || key === 'unsubscribeSecret'
}
