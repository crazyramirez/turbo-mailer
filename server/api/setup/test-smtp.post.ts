import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import nodemailer from 'nodemailer'

export default defineEventHandler(async (event) => {
  if (existsSync(resolve(process.cwd(), 'data/.installed'))) {
    throw createError({ statusCode: 403, message: 'Already installed' })
  }

  const { host, port, user, pass, secure } = await readBody(event)

  if (!host || !user || !pass) {
    throw createError({ statusCode: 400, message: 'Faltan campos SMTP requeridos' })
  }

  try {
    const transporter = nodemailer.createTransport({
      host: String(host),
      port: Number(port || 465),
      secure: secure !== false,
      auth: { user: String(user), pass: String(pass) },
      connectionTimeout: 8000,
      socketTimeout: 8000,
    })
    await transporter.verify()
    return { ok: true }
  } catch (e: any) {
    throw createError({ statusCode: 422, message: e.message || 'Conexión SMTP fallida' })
  }
})
