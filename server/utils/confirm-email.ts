import nodemailer from 'nodemailer'
import { signConfirmToken } from '~/server/utils/auth'

// Sends the double opt-in confirmation email to a newly subscribed contact.
// Fire-and-forget from the subscribe endpoint — a failed confirmation email
// must not fail the API call; the contact simply stays unconfirmed.
export async function sendConfirmationEmail(
  contactId: number,
  email: string,
  name: string | null,
  config: Record<string, any>,
): Promise<void> {
  const baseUrl = String(config.trackingBaseUrl || 'http://localhost:3000')
  const secret = String(config.unsubscribeSecret)
  const token = signConfirmToken(contactId, secret)
  const confirmUrl = `${baseUrl}/api/confirm?c=${contactId}&t=${token}`
  const fromName = String(config.smtpFromName || 'TurboMailer')
  const greeting = name ? `Hola ${name},` : 'Hola,'

  const transporter = nodemailer.createTransport({
    host: String(config.smtpHost),
    port: Number(config.smtpPort || 465),
    secure: Boolean(config.smtpSecure),
    auth: { user: String(config.smtpUser), pass: String(config.smtpPass) },
  })

  await transporter.sendMail({
    from: `"${fromName}" <${String(config.smtpFromEmail || config.smtpUser)}>`,
    to: email,
    subject: `Confirma tu suscripción a ${fromName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#0f172a;font-size:22px;margin-bottom:16px;">Confirma tu suscripción</h2>
      <p style="color:#475569;font-size:15px;line-height:1.6;">${greeting}</p>
      <p style="color:#475569;font-size:15px;line-height:1.6;">
        Has solicitado suscribirte a las comunicaciones de <b>${fromName}</b>.
        Para completar el alta, confirma tu dirección haciendo clic en el botón:
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#6366f1;border-radius:10px;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Confirmar suscripción</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;line-height:1.6;">
        Si no has solicitado esta suscripción, ignora este email — no recibirás nada más.
        El enlace caduca en 7 días.
      </p>
    </div>`,
    text: `${greeting}\n\nConfirma tu suscripción a ${fromName} abriendo este enlace:\n${confirmUrl}\n\nSi no has solicitado esta suscripción, ignora este email. El enlace caduca en 7 días.`,
  })
}
