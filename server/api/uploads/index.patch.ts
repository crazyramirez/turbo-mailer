import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { resolveUpload, sanitizeUploadName } from '~/server/utils/uploads'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { oldName, newName } = body ?? {}

  if (!oldName || !newName) {
    throw createError({ statusCode: 400, statusMessage: 'Nombres requeridos' })
  }

  const from = resolveUpload(String(oldName))
  if (!from) throw createError({ statusCode: 404, statusMessage: 'Archivo no encontrado' })

  // The extension can't change: a rename must not turn an image into .html
  const ext = path.extname(from).toLowerCase()
  const wanted = sanitizeUploadName(`${path.basename(String(newName), path.extname(String(newName)))}${ext}`)
  if (!wanted) throw createError({ statusCode: 400, statusMessage: 'Nombre no válido' })

  const to = path.join(path.dirname(from), wanted)
  if (existsSync(to)) throw createError({ statusCode: 409, statusMessage: 'file_exists' })

  await fs.rename(from, to)
  return { success: true, name: wanted }
})
