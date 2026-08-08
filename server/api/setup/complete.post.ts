import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { encryptField } from '~/server/utils/encryption'
import { hashApiKey } from '~/server/utils/auth'
import { markInstalled } from '~/server/middleware/setup-guard'

export default defineEventHandler(async (event) => {
  const sentinelPath = resolve(process.cwd(), 'data/.installed')
  if (existsSync(sentinelPath)) {
    throw createError({ statusCode: 403, message: 'Already installed' })
  }

  const body = await readBody(event)
  const { password, smtp, app, advanced } = body ?? {}

  if (!password || !smtp?.host || !smtp?.user || !smtp?.pass || !app?.trackingBaseUrl) {
    throw createError({ statusCode: 400, message: 'Campos requeridos faltantes' })
  }

  // The wizard validates these in the browser, but this endpoint is reachable
  // directly and runs exactly once — a weak password or a bogus tracking URL
  // baked in here would need a reinstall to correct.
  if (String(password).length < 8) {
    throw createError({ statusCode: 400, message: 'La contraseña debe tener al menos 8 caracteres' })
  }

  let parsedBaseUrl: URL
  try {
    parsedBaseUrl = new URL(String(app.trackingBaseUrl))
  } catch {
    throw createError({ statusCode: 400, message: 'La URL de tracking no es válida' })
  }
  if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
    throw createError({ statusCode: 400, message: 'La URL de tracking debe empezar por http:// o https://' })
  }

  const smtpPort = Number(smtp.port || 465)
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw createError({ statusCode: 400, message: 'El puerto SMTP no es válido' })
  }

  const hashedPassword = await bcrypt.hash(String(password), 12)
  const unsubscribeSecret = app.unsubscribeSecret?.trim() || randomBytes(32).toString('hex')
  const rawApiSecret = app.apiSecret?.trim() || randomBytes(32).toString('hex')
  const apiSecret = hashApiKey(rawApiSecret)

  const config: Record<string, any> = {
    appPassword: hashedPassword,
    smtpHost: String(smtp.host),
    smtpPort: String(smtpPort),
    smtpUser: String(smtp.user),
    smtpPass: encryptField(String(smtp.pass)),
    smtpSecure: smtp.secure !== false,
    smtpFromName: String(smtp.fromName || 'TurboMailer'),
    smtpFromEmail: String(smtp.fromEmail || smtp.user),
    trackingBaseUrl: String(app.trackingBaseUrl).replace(/\/$/, ''),
    unsubscribeSecret,
    apiSecret,
    smtpSendDelayMs: Number(smtp.sendDelayMs ?? 2000),
    smtpSendJitterMs: Number(smtp.sendJitterMs ?? 500),
    smtpMaxRetries: Number(smtp.maxRetries ?? 3),
    smtpRetryDelayMs: Number(smtp.retryDelayMs ?? 5000),
  }

  if (advanced?.openaiApiKey?.trim()) {
    config.openaiApiKey = encryptField(String(advanced.openaiApiKey).trim())
    config.openaiModel = String(advanced.openaiModel || 'gpt-4o-mini')
  }

  if (advanced?.dkimDomain?.trim() && advanced?.dkimPrivateKey?.trim()) {
    config.dkimDomain = String(advanced.dkimDomain).trim()
    config.dkimSelector = String(advanced.dkimSelector || 'default').trim()
    config.dkimPrivateKey = encryptField(String(advanced.dkimPrivateKey).trim())
  }

  // IMAP bounce detection
  config.imapAutoDetect = smtp.imapAutoDetect !== false
  if (!config.imapAutoDetect) {
    config.imapHost = String(smtp.imapHost || '').trim()
    config.imapPort = Number(smtp.imapPort || 993)
    config.imapUser = String(smtp.imapUser || smtp.user).trim()
    config.imapPass = encryptField(String(smtp.imapPass || smtp.pass).trim())
    config.imapTls  = true
  }

  // A fresh clone has no data/ directory; without this the whole install
  // fails on the very first write.
  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })

  writeFileSync(
    resolve(process.cwd(), 'data/config.json'),
    JSON.stringify(config, null, 2),
    'utf-8',
  )

  const envLines = [
    `# TurboMailer — generado por Setup Wizard (${new Date().toISOString()})`,
    `# Edita este archivo para cambios manuales, o usa el wizard de reconfiguración.`,
    ``,
    `APP_PASSWORD=${config.appPassword}`,
    `PORTAL_KEY=admin`,
    `GHOST_MODE=false`,
    ``,
    `SMTP_HOST=${config.smtpHost}`,
    `SMTP_PORT=${config.smtpPort}`,
    `SMTP_USER=${config.smtpUser}`,
    `SMTP_PASS=${config.smtpPass}`,
    `SMTP_SECURE=${config.smtpSecure}`,
    `SMTP_FROM_NAME=${config.smtpFromName}`,
    `SMTP_FROM_EMAIL=${config.smtpFromEmail}`,
    ``,
    `TRACKING_BASE_URL=${config.trackingBaseUrl}`,
    `UNSUBSCRIBE_SECRET=${config.unsubscribeSecret}`,
    `# API_SECRET below is the RAW key — config.json stores a SHA-256 hash`,
    `API_SECRET=${rawApiSecret}`,
    ``,
    `SMTP_SEND_DELAY_MS=${config.smtpSendDelayMs}`,
    `SMTP_SEND_JITTER_MS=${config.smtpSendJitterMs}`,
    `SMTP_MAX_RETRIES=${config.smtpMaxRetries}`,
    `SMTP_RETRY_DELAY_MS=${config.smtpRetryDelayMs}`,
    ``,
    `# AI (opcional)`,
    config.openaiApiKey ? `OPENAI_API_KEY=${config.openaiApiKey}` : `# OPENAI_API_KEY=sk-...`,
    config.openaiModel  ? `OPENAI_MODEL=${config.openaiModel}`   : `# OPENAI_MODEL=gpt-4o-mini`,
    ``,
    `# DKIM Signing (opcional)`,
    config.dkimDomain     ? `DKIM_DOMAIN=${config.dkimDomain}`         : `# DKIM_DOMAIN=`,
    config.dkimSelector   ? `DKIM_SELECTOR=${config.dkimSelector}`     : `# DKIM_SELECTOR=default`,
    config.dkimPrivateKey ? `DKIM_PRIVATE_KEY="${config.dkimPrivateKey}"` : `# DKIM_PRIVATE_KEY=`,
    ``,
    `# IMAP Bounce Detection`,
    `IMAP_AUTO_DETECT=${config.imapAutoDetect}`,
    config.imapHost ? `IMAP_HOST=${config.imapHost}` : `# IMAP_HOST=imap.gmail.com`,
    config.imapHost ? `IMAP_PORT=${config.imapPort}` : `# IMAP_PORT=993`,
    config.imapHost ? `IMAP_USER=${config.imapUser}` : `# IMAP_USER=`,
    config.imapHost ? `IMAP_PASS=${config.imapPass}` : `# IMAP_PASS=`,
  ]
  // Trailing newline: POSIX tools and `cat >>` append cleanly to the last line
  // otherwise, silently corrupting IMAP_PASS.
  writeFileSync(resolve(process.cwd(), '.env'), envLines.join('\n') + '\n', 'utf-8')

  // Sentinel last: if any write above throws, setup stays reachable instead of
  // locking the user out of a half-configured install.
  writeFileSync(sentinelPath, new Date().toISOString(), 'utf-8')

  // Both caches must be dropped in-process. config.json is re-read lazily and
  // the guard flips to installed, so the app is usable immediately — no restart.
  invalidateServerConfig()
  markInstalled()

  return { ok: true }
})
