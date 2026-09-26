import { validateSettingsPatch, publicSettings } from '~/server/utils/settings-schema'
import { writeServerConfig, readFileConfig } from '~/server/utils/serverConfig'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'
import { randomBytes } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const { clean, errors } = validateSettingsPatch(body ?? {})
  if (errors.length) throw createError({ statusCode: 400, statusMessage: errors.join('; ') })

  // Seed mailboxes: keep stored passwords when the UI sends them blank
  if (Array.isArray(clean.seedMailboxes)) {
    const current = readFileConfig().seedMailboxes
    const existing = new Map((Array.isArray(current) ? current : []).map((s: any) => [s.id, s]))
    clean.seedMailboxes = (clean.seedMailboxes as any[]).slice(0, 20).map((s) => {
      const id = String(s.id || randomBytes(6).toString('hex'))
      const prev = existing.get(id) as any
      return {
        id,
        email: String(s.email || '').trim().slice(0, 254),
        label: String(s.label || '').trim().slice(0, 60) || undefined,
        provider: String(s.provider || '').trim().slice(0, 40) || undefined,
        imapHost: String(s.imapHost || '').trim().slice(0, 255),
        imapPort: Number(s.imapPort) || 993,
        user: String(s.user || '').trim().slice(0, 254) || undefined,
        pass: s.pass ? String(s.pass) : prev?.pass,
        tls: s.tls !== false,
      }
    }).filter(s => s.email && s.imapHost)
  }

  writeServerConfig(clean)
  logAudit('settings.update', { keys: Object.keys(clean) }, getClientIp(event))
  return { ok: true, settings: publicSettings(useServerConfig()) }
})
