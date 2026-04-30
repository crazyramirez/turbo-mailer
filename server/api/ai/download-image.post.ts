import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const imageUrl = body.url

  if (!imageUrl) {
    throw createError({ statusCode: 400, statusMessage: 'No URL provided' })
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })

  try {
    // Aumentamos el timeout y añadimos headers para asegurar que Pollinations genere
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`URL did not return a valid image type. Type: ${contentType}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Verificamos y optimizamos con Sharp
    const image = sharp(buffer)
    const metadata = await image.metadata()

    const filename = `ai_img_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`
    const filepath = path.join(uploadDir, filename)

    let finalBuffer: Buffer
    if (metadata.width && metadata.width > 1200) {
      finalBuffer = await image.resize(1200).jpeg({ quality: 85 }).toBuffer()
    } else {
      finalBuffer = await image.jpeg({ quality: 85 }).toBuffer()
    }

    await fs.writeFile(filepath, finalBuffer)

    return { url: `/uploads/${filename}` }
  } catch (error: any) {
    console.error('Error downloading external image:', error.message)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Error processing external image'
    })
  }
})
