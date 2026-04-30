import { promises as fs } from 'node:fs'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  
  try {
    // Ensure directory exists
    await fs.mkdir(uploadDir, { recursive: true })
    
    const files = await fs.readdir(uploadDir)
    const images = files.filter(file => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file))
    
    return images.map(file => ({
      name: file,
      url: `/uploads/${file}`,
      size: 0, // Could add size if needed
    }))
  } catch (error) {
    console.error('Error reading uploads directory:', error)
    return []
  }
})
