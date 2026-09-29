import { downloadRemoteImage, saveImage } from '~/server/utils/uploads'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const imageUrl = body.url

  if (!imageUrl) {
    throw createError({ statusCode: 400, statusMessage: 'No URL provided' })
  }

  try {
    const buffer = await downloadRemoteImage(imageUrl)
    // Decoded, validated and re-encoded like any upload
    const saved = await saveImage(buffer, 'ai-image.jpg', 'ai_')
    return { url: saved.url }
  } catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error downloading external image:', error.message)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Error processing external image'
    })
  }
})
