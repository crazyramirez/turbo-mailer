import nodemailer from 'nodemailer'
import { db } from '~/server/db/index'
import { sends, contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

async function sendConfirmationEmail(email: string, name: string | null, config: any) {
  const {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpSecure,
    smtpFromName,
    smtpFromEmail
  } = config

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  const displayName = name || email
  const senderEmail = smtpFromEmail || smtpUser

  await transporter.sendMail({
    from: `"${smtpFromName}" <${senderEmail}>`,
    to: email,
    subject: 'Has sido dado de baja correctamente',
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:40px 48px;text-align:center;">
              <div style="font-size:40px;margin-bottom:16px;">✓</div>
              <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 12px;">Baja confirmada</h1>
              <p style="font-size:15px;color:#64748b;line-height:1.7;margin:0 0 24px;">
                Hola ${displayName},<br>
                hemos procesado tu solicitud. No volverás a recibir emails de nuestra parte.
              </p>
              <p style="font-size:13px;color:#94a3b8;margin:0;">
                Si esto fue un error, contacta con nosotros directamente respondiendo a este email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  })
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const sendId = Number(query.s)

  if (!sendId) {
    return { status: 'error', message: 'Invalid link' }
  }

  try {
    const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
    if (!send) return { status: 'error', message: 'Not found' }

    const [contact] = await db.select().from(contacts).where(eq(contacts.email, send.email))
    if (!contact) return { status: 'error', message: 'Contact not found' }

    if (contact.status === 'unsubscribed') return { status: 'already' }

    await db.update(contacts).set({ status: 'unsubscribed', updatedAt: new Date() })
      .where(eq(contacts.id, contact.id))

    // Fire-and-forget — don't block response on email delivery
    sendConfirmationEmail(contact.email, contact.name, config).catch(() => {})

    return { status: 'ok' }
  } catch {
    return { status: 'error', message: 'Server error' }
  }
})
