import { randomBytes } from 'node:crypto'
import { writeServerConfig, readFileConfig } from '~/server/utils/serverConfig'
import { closeAllTransports } from '~/server/utils/mailer'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Create/update an SMTP profile. id 'default' edits the primary settings
// (smtpHost, smtpUser...); others live in config.smtpProfiles. A blank
// password or DKIM key keeps the stored one.
export default defineEventHandler(async (event) => {
  const b = await readBody<Record<string, any>>(event)
  const id = String(b?.id || '') || randomBytes(6).toString('hex')
  const host = String(b?.host || '').trim()
  const user = String(b?.user || '').trim()
  const port = Number(b?.port || 465)
  if (!host || !user) throw createError({ statusCode: 400, statusMessage: 'host y usuario son obligatorios' })
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw createError({ statusCode: 400, statusMessage: 'Puerto no válido' })
  const email = String(b?.fromEmail || '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'Email del remitente no válido' })

  const file = readFileConfig()
  const secure = b?.secure !== false
  const fromName = String(b?.fromName || '').trim().slice(0, 100)
  const replyTo = String(b?.replyTo || '').trim().slice(0, 254)
  const dkimDomain = String(b?.dkimDomain || '').trim().toLowerCase().slice(0, 253)
  const dkimSelector = String(b?.dkimSelector || '').trim().slice(0, 63)

  if (id === 'default') {
    writeServerConfig({
      smtpHost: host,
      smtpPort: String(port),
      smtpUser: user,
      smtpSecure: secure,
      smtpFromEmail: email || user,
      smtpFromName: fromName || 'TurboMailer',
      smtpReplyTo: replyTo || null,
      dkimDomain: dkimDomain || null,
      dkimSelector: dkimSelector || null,
      smtpDailyLimit: Number(b?.dailyLimit) > 0 ? Number(b.dailyLimit) : null,
      ...(b?.pass ? { smtpPass: String(b.pass) } : {}),
      ...(b?.dkimPrivateKey ? { dkimPrivateKey: String(b.dkimPrivateKey).trim() } : {}),
    })
  } else {
    const list: any[] = Array.isArray(file.smtpProfiles) ? [...file.smtpProfiles] : []
    const idx = list.findIndex(p => p?.id === id)
    const prev = idx >= 0 ? list[idx] : null
    if (!prev && !b?.pass) throw createError({ statusCode: 400, statusMessage: 'La contraseña es obligatoria' })
    const profile = {
      id,
      name: String(b?.name || host).trim().slice(0, 60),
      host, port, secure, user,
      pass: b?.pass ? String(b.pass) : prev?.pass,
      fromEmail: email || undefined,
      fromName: fromName || undefined,
      replyTo: replyTo || undefined,
      dkimDomain: dkimDomain || undefined,
      dkimSelector: dkimSelector || undefined,
      dkimPrivateKey: b?.dkimPrivateKey ? String(b.dkimPrivateKey).trim() : prev?.dkimPrivateKey,
      maxPerSecond: Math.max(0, Number(b?.maxPerSecond) || 0),
      dailyLimit: Math.max(0, Number(b?.dailyLimit) || 0),
      backup: !!b?.backup,
      enabled: b?.enabled !== false,
      priority: Number.isFinite(Number(b?.priority)) ? Number(b.priority) : 10,
    }
    if (idx >= 0) list[idx] = profile
    else list.push(profile)
    writeServerConfig({ smtpProfiles: list })
  }

  closeAllTransports()
  logAudit('settings.sender_saved', { id, host }, getClientIp(event))
  return { ok: true, id }
})
