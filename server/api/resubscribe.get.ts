import nodemailer from 'nodemailer'
import { db } from '~/server/db/index'
import { sends, contacts, campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyResubscribeToken } from '~/server/utils/auth'
import { emailT } from '~/server/utils/email-locale'
import { checkAndIncrementSubLimit } from '~/server/utils/sub-rate-limit'

async function sendResubConfirmationEmail(
  email: string,
  name: string | null,
  config: any,
  lang = 'es',
  customSubject?: string | null,
  customMessage?: string | null,
) {
  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFromName, smtpFromEmail } = config

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  const rawName = name || email
  const displayName = rawName
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
  const senderEmail = smtpFromEmail || smtpUser

  const t = (key: string, vars?: Record<string, string>) => emailT(lang, `emails.${key}`, vars)
  const subject = customSubject || t('resub_subject')
  const message = customMessage || t('resub_message')

  await transporter.sendMail({
    from: `"${smtpFromName}" <${senderEmail}>`,
    to: email,
    subject,
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:40px 48px;text-align:center;">
              <div style="font-size:40px;margin-bottom:16px;">👋</div>
              <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 12px;">${t('resub_title')}</h1>
              <p style="font-size:15px;color:#64748b;line-height:1.7;margin:0 0 24px;">
                ${t('resub_greeting', { name: displayName })}<br>
                ${message}
              </p>
              <p style="font-size:13px;color:#94a3b8;margin:0;">
                ${t('resub_footer')}
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

  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const query = getQuery(event)
  const sendId = Number(query.s)
  const token = String(query.t || '')

  if (!sendId || !token) {
    return { status: 'error', message: 'Invalid link' }
  }

  if (!verifyResubscribeToken(sendId, token, config.unsubscribeSecret as string)) {
    return { status: 'error', message: 'Invalid link' }
  }

  try {
    const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
    if (!send) return { status: 'error', message: 'Not found' }

    const [contact] = await db.select().from(contacts).where(eq(contacts.email, send.email))
    if (!contact) return { status: 'error', message: 'Contact not found' }

    if (contact.status === 'active') return { status: 'already' }

    const limit = await checkAndIncrementSubLimit(contact.id)
    if (!limit.allowed) {
      const resetInHours = limit.resetAt ? Math.ceil((limit.resetAt.getTime() - Date.now()) / 3_600_000) : 24
      return { status: 'rate_limited', resetInHours }
    }

    await db.update(contacts).set({ status: 'active', updatedAt: new Date() })
      .where(eq(contacts.id, contact.id))

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, send.campaignId)) as any[]

    sendResubConfirmationEmail(
      contact.email, contact.name, config,
      'es', campaign?.resubEmailSubject, campaign?.resubEmailMessage,
    ).catch(() => {})

    return { status: 'ok' }
  } catch {
    return { status: 'error', message: 'Server error' }
  }
})
