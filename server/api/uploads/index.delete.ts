import { promises as fs } from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const filename = query.filename as string
  
  if (!filename) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Filename is required',
    })
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  const filepath = path.join(uploadDir, filename)
  
  try {
    // Check if file exists and is within the upload directory (prevent directory traversal)
    const resolvedPath = path.resolve(filepath)
    if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
      })
    }

    await fs.unlink(filepath)
    return { success: true }
  } catch (error) {
    console.error(`Error deleting file ${filename}:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Error deleting file',
    })
  }
})
