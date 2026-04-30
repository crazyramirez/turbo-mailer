import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

export default defineEventHandler(async (event) => {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  
  // Ensure directory exists
  try {
    await fs.mkdir(uploadDir, { recursive: true })
  } catch (err) {
    console.error('Error creating upload directory:', err)
  }
  
  const formData = await readMultipartFormData(event)
  if (!formData) {
    console.warn('Upload attempt with no form data')
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded',
    })
  }

  const results = []

  for (const field of formData) {
    // Some browsers or libraries might send 'files', 'files[]', or just 'file'
    // We also check if it has a filename to be sure it's a file field
    if ((field.name === 'files' || field.name === 'file' || field.name?.includes('files')) && field.filename) {
      // Sanitize filename: remove path components and illegal characters
      const safeFilename = field.filename.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filename = `${Date.now()}-${safeFilename}`
      const filepath = path.join(uploadDir, filename)
      
      console.log(`Processing upload: ${field.filename} -> ${filename}`)
      
      try {
        let buffer: Buffer = field.data
        
        // Try to process with sharp, but fallback to raw data if it fails
        try {
          const image = sharp(field.data)
          const metadata = await image.metadata()
          
          if (metadata.width && metadata.width > 1200) {
            buffer = await image.resize(1200).toBuffer()
            console.log(`Resized image ${filename} to 1200px width`)
          }
        } catch (sharpError) {
          console.warn(`Sharp processing failed for ${field.filename}, saving original file.`, sharpError)
          buffer = field.data
        }
        
        await fs.writeFile(filepath, buffer)
        
        results.push({
          name: filename,
          url: `/uploads/${filename}`,
        })
        console.log(`Successfully saved: ${filename}`)
      } catch (error) {
        console.error(`Error saving file ${field.filename}:`, error)
      }
    } else {
      console.log(`Skipping field: ${field.name} (filename: ${field.filename})`)
    }
  }

  if (results.length === 0) {
    console.warn('No files were successfully processed from the upload')
  }

  return results
})
