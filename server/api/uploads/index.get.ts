import { listUploads } from '~/server/utils/uploads'

export default defineEventHandler(async () => {
  try {
    return await listUploads()
  } catch (error) {
    console.error('Error reading uploads directory:', error)
    return []
  }
})
