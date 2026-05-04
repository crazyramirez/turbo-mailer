import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

let _cache: Record<string, any> | null = null

export const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data')

function getFileConfig(): Record<string, any> {
  if (_cache) return _cache
  const p = resolve(dataDir, 'config.json')
  _cache = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any>) : {}
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
  trackingBaseUrl:       'TRACKING_BASE_URL',
  unsubscribeSecret:     'UNSUBSCRIBE_SECRET',
  apiSecret:             'API_SECRET',
  smtpSendDelayMs:       'SMTP_SEND_DELAY_MS',
  smtpSendJitterMs:      'SMTP_SEND_JITTER_MS',
  smtpMaxRetries:        'SMTP_MAX_RETRIES',
  smtpRetryDelayMs:      'SMTP_RETRY_DELAY_MS',
  smtpMaxEmailsPerSecond:'SMTP_MAX_EMAILS_PER_SECOND',
  openaiApiKey:          'OPENAI_API_KEY',
  openaiModel:           'OPENAI_MODEL',
  dkimDomain:            'DKIM_DOMAIN',
  dkimSelector:          'DKIM_SELECTOR',
  dkimPrivateKey:        'DKIM_PRIVATE_KEY',
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
