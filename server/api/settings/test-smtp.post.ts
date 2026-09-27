import nodemailer from 'nodemailer'
import { getSmtpProfiles, formatAddress, senderIdentity, newMessageId } from '~/server/utils/mailer'
import { classifySmtpError, describeFailure } from '~/server/utils/smtp-classify'
import { isValidEmail } from '~/server/utils/validate'

// Checks a saved SMTP profile: connection + auth, and optionally delivers a
// real test message (to see DKIM/SPF results in the recipient's headers).
export default defineEventHandler(async (event) => {
  const b = await readBody<{ id?: string; to?: unknown }>(event)
  const to = b?.to === undefined ? undefined : typeof b.to === 'string' ? b.to.trim() : ''
  if (to !== undefined && !isValidEmail(to)) {
    throw createError({ statusCode: 400, statusMessage: 'Email de destino no válido' })
  }
  const config = useServerConfig()
  const profile = getSmtpProfiles(config).find(p => p.id === (b?.id || 'default'))
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Perfil no encontrado' })

  const transport = nodemailer.createTransport({
    host: profile.host, port: profile.port, secure: profile.secure,
    auth: { user: profile.user, pass: profile.pass },
    dkim: profile.dkimDomain && profile.dkimSelector && profile.dkimPrivateKey
      ? { domainName: profile.dkimDomain, keySelector: profile.dkimSelector, privateKey: profile.dkimPrivateKey.replace(/\\n/g, '\n') }
      : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  } as any)

  try {
    const started = Date.now()
    try {
      await transport.verify()
    } catch (err) {
      return { ok: false, stage: 'connect', error: describeFailure(classifySmtpError(err)) }
    }
    const connectMs = Date.now() - started

    if (to) {
      const id = senderIdentity(profile, config)
      try {
        await transport.sendMail({
          from: formatAddress(id.name, id.email),
          to,
          replyTo: id.replyTo,
          subject: `TurboMailer — prueba SMTP (${profile.name})`,
          text: `Este es un email de prueba enviado desde el perfil «${profile.name}» (${profile.host}).\nRevisa las cabeceras: DKIM, SPF y DMARC deberían aparecer como "pass".`,
          messageId: newMessageId(id.domain),
        })
      } catch (err) {
        return { ok: false, stage: 'send', connectMs, error: describeFailure(classifySmtpError(err)) }
      }
    }
    return { ok: true, connectMs }
  } finally {
    transport.close()
  }
})
