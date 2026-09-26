import { promises as fs } from 'node:fs'
import { resolveUpload } from '~/server/utils/uploads'

export default defineEventHandler(async (event) => {
  const filename = String(getQuery(event).filename ?? '')
  if (!filename) {
    throw createError({ statusCode: 400, statusMessage: 'Filename is required' })
  }
  const file = resolveUpload(filename)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  await fs.unlink(file)
  return { success: true }
})
