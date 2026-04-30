import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

export default defineEventHandler(async (event) => {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  
  // Ensure directory exists
  await fs.mkdir(uploadDir, { recursive: true })
  
  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded',
    })
  }

  const results = []

  for (const field of formData) {
    if (field.name === 'files') {
      const filename = `${Date.now()}-${field.filename}`
      const filepath = path.join(uploadDir, filename)
      
      try {
        // Resize image if it's wider than 1200px
        const image = sharp(field.data)
        const metadata = await image.metadata()
        
        let buffer: Buffer
        if (metadata.width && metadata.width > 1200) {
          buffer = await image.resize(1200).toBuffer()
        } else {
          buffer = field.data
        }
        
        await fs.writeFile(filepath, buffer)
        
        results.push({
          name: filename,
          url: `/uploads/${filename}`,
        })
      } catch (error) {
        console.error(`Error processing file ${field.filename}:`, error)
      }
    }
  }

  return results
})
