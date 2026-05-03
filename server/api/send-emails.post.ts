import nodemailer from 'nodemailer'
import { applyVars } from '~/server/utils/template'

export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  const {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpSecure,
    smtpFromName,
    smtpFromEmail
  } = config

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Configuración SMTP incompleta en el servidor (.env)',
    })
  }

  const body = await readBody(event)
  const { subject, htmlBody, recipients } = body // recipients: { email: string, vars: Record<string, string> }[]

  if (!subject || !htmlBody || !recipients?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Faltan parámetros requeridos' })
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })


  const results: { email: string; status: 'sent' | 'failed'; error?: string }[] = []

  for (const item of recipients) {
    const { email, vars } = item
    try {
      const personalizedSubject = applyVars(subject, vars)
      const personalizedHtml = applyVars(htmlBody, vars)

      const senderEmail = smtpFromEmail || smtpUser
      await transporter.sendMail({
        from: `"${smtpFromName}" <${senderEmail}>`,
        to: email,
        subject: personalizedSubject,
        html: personalizedHtml,
      })
      results.push({ email, status: 'sent' })
    } catch (err: any) {
      results.push({ email: typeof item === 'string' ? item : item.email, status: 'failed', error: err.message })
    }
  }

  return { results, sender: smtpFromEmail || smtpUser }
})
