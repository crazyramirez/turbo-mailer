import { ImapFlow } from 'imapflow'
import { getImapConfig } from '~/server/utils/bounce-processor'

// Connects to the bounce mailbox with the saved settings and lists folders.
export default defineEventHandler(async () => {
  const cfg = getImapConfig()
  if (!cfg) throw createError({ statusCode: 422, statusMessage: 'IMAP no configurado' })
  const config = useServerConfig()
  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: cfg.tls,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: { rejectUnauthorized: String(config.imapAllowInvalidCert) !== 'true' },
    connectionTimeout: 12_000,
  } as any)
  try {
    await client.connect()
    const boxes = await client.list()
    await client.logout()
    return { ok: true, host: cfg.host, folders: boxes.map(b => b.path).slice(0, 50) }
  } catch (err: any) {
    try { await client.logout() } catch {}
    const msg = String(err?.message || err)
    const hint = /certificate|self[- ]signed|CERT/i.test(msg)
      ? 'El certificado TLS del servidor IMAP no es válido. Corrige el certificado o activa "Permitir certificado no válido".'
      : /auth|login|credential/i.test(msg) ? 'Credenciales IMAP incorrectas.' : null
    return { ok: false, host: cfg.host, error: msg.slice(0, 300), hint }
  }
})
