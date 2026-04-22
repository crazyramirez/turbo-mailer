import nodemailer from 'nodemailer'

export default defineEventHandler(async (event) => {
  const gmailUser = process.env.GMAIL_USER
  const gmailPassword = process.env.GMAIL_APP_PASSWORD

  if (!gmailUser || !gmailPassword) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Credenciales Gmail no configuradas en el servidor (.env)',
    })
  }

  const body = await readBody(event)
  const { subject, htmlBody, recipients } = body // recipients: { email: string, vars: Record<string, string> }[]

  if (!subject || !htmlBody || !recipients?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Faltan parámetros requeridos' })
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
  })

  /** Helper to substitute variables */
  const applyVars = (tpl: string, vars: Record<string, string>) => {
    let result = tpl
    for (const [key, value] of Object.entries(vars)) {
      const reg = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
      result = result.replace(reg, value || '')
    }
    return result
  }

  const results: { email: string; status: 'sent' | 'failed'; error?: string }[] = []

  for (const item of recipients) {
    const { email, vars } = item
    try {
      const personalizedSubject = applyVars(subject, vars)
      const personalizedHtml = applyVars(htmlBody, vars)

      await transporter.sendMail({
        from: `"${gmailUser}" <${gmailUser}>`,
        to: email,
        subject: personalizedSubject,
        html: personalizedHtml,
      })
      results.push({ email, status: 'sent' })
    } catch (err: any) {
      results.push({ email: typeof item === 'string' ? item : item.email, status: 'failed', error: err.message })
    }
  }

  return { results, sender: gmailUser }
})
