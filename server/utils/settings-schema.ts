// Whitelist + validation for everything editable from the Settings screen.
// Anything not listed here can't be written through the API (e.g. the
// unsubscribe secret: changing it would break every link already sent).

type Kind = 'string' | 'secret' | 'bool' | 'int' | 'float' | 'url' | 'email' | 'enum' | 'json'

interface FieldDef {
  kind: Kind
  min?: number
  max?: number
  maxLen?: number
  values?: string[]
}

export const SETTINGS_FIELDS: Record<string, FieldDef> = {
  // General
  trackingBaseUrl: { kind: 'url' },
  companyName: { kind: 'string', maxLen: 200 },
  companyAddress: { kind: 'string', maxLen: 500 },
  defaultLocale: { kind: 'enum', values: ['es', 'en'] },

  // Sending pace & behaviour
  smtpSendDelayMs: { kind: 'int', min: 0, max: 60_000 },
  smtpSendJitterMs: { kind: 'int', min: 0, max: 10_000 },
  smtpMaxEmailsPerSecond: { kind: 'float', min: 0, max: 1000 },
  smtpConcurrency: { kind: 'int', min: 1, max: 10 },
  smtpMaxConnections: { kind: 'int', min: 1, max: 10 },
  smtpMaxRetries: { kind: 'int', min: 1, max: 6 },
  smtpDailyLimit: { kind: 'int', min: 0, max: 10_000_000 },
  smtpReplyTo: { kind: 'email' },
  throttle_google: { kind: 'int', min: 0, max: 100_000 },
  throttle_microsoft: { kind: 'int', min: 0, max: 100_000 },
  throttle_yahoo: { kind: 'int', min: 0, max: 100_000 },
  throttle_apple: { kind: 'int', min: 0, max: 100_000 },
  throttle_other: { kind: 'int', min: 0, max: 100_000 },
  warmupEnabled: { kind: 'bool' },
  warmupStartVolume: { kind: 'int', min: 1, max: 1_000_000 },
  warmupGrowthPct: { kind: 'int', min: 1, max: 200 },
  warmupMaxPerDay: { kind: 'int', min: 1, max: 10_000_000 },
  warmupStartDate: { kind: 'string', maxLen: 30 },
  unsubConfirmationEmail: { kind: 'bool' },

  // Deliverability
  bounceAddress: { kind: 'email' },
  imapAutoDetect: { kind: 'bool' },
  imapHost: { kind: 'string', maxLen: 255 },
  imapPort: { kind: 'int', min: 1, max: 65535 },
  imapUser: { kind: 'string', maxLen: 255 },
  imapPass: { kind: 'secret' },
  imapTls: { kind: 'bool' },
  imapAllowInvalidCert: { kind: 'bool' },
  inboundAutoProcess: { kind: 'bool' },
  spamCheckUrl: { kind: 'string', maxLen: 300 },
  sunsetEnabled: { kind: 'bool' },
  sunsetDays: { kind: 'int', min: 30, max: 1000 },
  sunsetMinSends: { kind: 'int', min: 1, max: 100 },
  cbMinSample: { kind: 'int', min: 10, max: 100_000 },
  cbMaxHardBounceRate: { kind: 'float', min: 0.005, max: 1 },
  cbMaxBlockRate: { kind: 'float', min: 0.01, max: 1 },
  blocklistMonitor: { kind: 'bool' },
  sendingIps: { kind: 'string', maxLen: 1000 },
  doubleOptIn: { kind: 'bool' },
  seedMailboxes: { kind: 'json' },

  // AI
  aiProvider: { kind: 'enum', values: ['anthropic', 'openai', 'compatible'] },
  anthropicApiKey: { kind: 'secret' },
  anthropicModel: { kind: 'string', maxLen: 100 },
  openaiApiKey: { kind: 'secret' },
  openaiModel: { kind: 'string', maxLen: 100 },
  aiBaseUrl: { kind: 'url' },
  aiApiKey: { kind: 'secret' },
  aiModel: { kind: 'string', maxLen: 100 },
  aiPersonalization: { kind: 'bool' },

  // Integrations & alerts
  webhookUrl: { kind: 'url' },
  webhookSecret: { kind: 'secret' },
  alertSlackWebhook: { kind: 'url' },
  alertTelegramToken: { kind: 'secret' },
  alertTelegramChatId: { kind: 'string', maxLen: 50 },
  alertEmail: { kind: 'email' },
  metricsToken: { kind: 'secret' },
  turnstileSiteKey: { kind: 'string', maxLen: 200 },
  turnstileSecret: { kind: 'secret' },

  // Backups
  backupEnabled: { kind: 'bool' },
  backupKeepLocal: { kind: 'int', min: 1, max: 100 },
  backupPassphrase: { kind: 'secret' },
  s3Endpoint: { kind: 'url' },
  s3Region: { kind: 'string', maxLen: 50 },
  s3Bucket: { kind: 'string', maxLen: 100 },
  s3AccessKey: { kind: 'string', maxLen: 200 },
  s3SecretKey: { kind: 'secret' },
  s3Retention: { kind: 'int', min: 1, max: 365 },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSettingsPatch(patch: Record<string, unknown>): { clean: Record<string, unknown>; errors: string[] } {
  const clean: Record<string, unknown> = {}
  const errors: string[] = []
  for (const [key, raw] of Object.entries(patch ?? {})) {
    const def = SETTINGS_FIELDS[key]
    if (!def) { errors.push(`${key}: not editable`); continue }
    // null clears a value; for secrets '' means "keep current"
    if (raw === null) { clean[key] = null; continue }
    switch (def.kind) {
      case 'secret': {
        const s = String(raw)
        if (s === '' || /^•+$/.test(s)) continue
        if (s.length > 10_000) { errors.push(`${key}: too long`); continue }
        clean[key] = s.trim()
        break
      }
      case 'bool':
        clean[key] = raw === true || raw === 'true' || raw === 1 || raw === '1'
        break
      case 'int':
      case 'float': {
        if (raw === '') { clean[key] = null; break }
        const n = Number(raw)
        if (!Number.isFinite(n)) { errors.push(`${key}: not a number`); continue }
        const v = def.kind === 'int' ? Math.round(n) : n
        if ((def.min !== undefined && v < def.min) || (def.max !== undefined && v > def.max)) {
          errors.push(`${key}: out of range (${def.min}–${def.max})`)
          continue
        }
        clean[key] = v
        break
      }
      case 'url': {
        const s = String(raw).trim()
        if (!s) { clean[key] = null; break }
        try {
          const u = new URL(s)
          if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
          clean[key] = s.replace(/\/$/, '')
        } catch {
          errors.push(`${key}: invalid URL`)
        }
        break
      }
      case 'email': {
        const s = String(raw).trim()
        if (!s) { clean[key] = null; break }
        if (!EMAIL_RE.test(s)) { errors.push(`${key}: invalid email`); continue }
        clean[key] = s
        break
      }
      case 'enum': {
        const s = String(raw)
        if (!def.values!.includes(s)) { errors.push(`${key}: invalid value`); continue }
        clean[key] = s
        break
      }
      case 'json':
        clean[key] = raw
        break
      default: {
        const s = String(raw).trim()
        if (def.maxLen && s.length > def.maxLen) { errors.push(`${key}: too long`); continue }
        clean[key] = s || null
      }
    }
  }
  return { clean, errors }
}

/** Current values for the UI — secrets are never returned, only whether set. */
export function publicSettings(config: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(SETTINGS_FIELDS)) {
    const v = config[key]
    if (def.kind === 'secret') out[key] = { set: !!(v && String(v).length) }
    else if (key === 'seedMailboxes') {
      out[key] = (Array.isArray(v) ? v : []).map((s: any) => ({ ...s, pass: undefined, passSet: !!s?.pass }))
    } else out[key] = v ?? null
  }
  return out
}
