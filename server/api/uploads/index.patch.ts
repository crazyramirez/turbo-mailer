import { promises as fs } from 'fs'
import path from 'path'
import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { oldName, newName } = body

  if (!oldName || !newName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nombres requeridos'
    })
  }

  const uploadDir = path.join(process.cwd(), 'public/uploads')
  const oldPath = path.join(uploadDir, oldName)
  const newPath = path.join(uploadDir, newName)

  // Security: prevent path traversal
  if (!oldPath.startsWith(uploadDir) || !newPath.startsWith(uploadDir)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Acceso denegado'
    })
  }

  try {
    // Check if old file exists
    await fs.access(oldPath)
    
    // Check if new file already exists
    try {
      await fs.access(newPath)
      // If no error, it exists
      throw createError({
        statusCode: 409,
        statusMessage: 'file_exists'
      })
    } catch (err: any) {
      if (err.statusCode === 409) throw err
      // If error is "not found", we can continue
    }

    await fs.rename(oldPath, newPath)
    return { success: true }
  } catch (error: any) {
    if (error.statusCode === 409) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Error al renombrar el archivo: ' + error.message
    })
  }
})
