import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

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

  const hashedPassword = await bcrypt.hash(String(password), 12)
  const unsubscribeSecret = app.unsubscribeSecret?.trim() || randomBytes(32).toString('hex')
  const apiSecret = app.apiSecret?.trim() || randomBytes(32).toString('hex')

  const config: Record<string, any> = {
    appPassword: hashedPassword,
    smtpHost: String(smtp.host),
    smtpPort: String(smtp.port || '465'),
    smtpUser: String(smtp.user),
    smtpPass: String(smtp.pass),
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
    config.openaiApiKey = String(advanced.openaiApiKey).trim()
    config.openaiModel = String(advanced.openaiModel || 'gpt-4o-mini')
  }

  if (advanced?.dkimDomain?.trim() && advanced?.dkimPrivateKey?.trim()) {
    config.dkimDomain = String(advanced.dkimDomain).trim()
    config.dkimSelector = String(advanced.dkimSelector || 'default').trim()
    config.dkimPrivateKey = String(advanced.dkimPrivateKey).trim()
  }

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
    `API_SECRET=${config.apiSecret}`,
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
  ]
  writeFileSync(resolve(process.cwd(), '.env'), envLines.join('\n'), 'utf-8')

  writeFileSync(sentinelPath, new Date().toISOString(), 'utf-8')
  invalidateServerConfig()

  return { ok: true }
})
