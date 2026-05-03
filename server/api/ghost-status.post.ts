import { db } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const config = useServerConfig()
  
  try {
    await db.insert(settings)
      .values({ 
        key: 'ghost_setup_seen', 
        value: '1',
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { 
          value: '1', 
          updatedAt: new Date() 
        }
      })
    
    return { success: true }
  } catch (err) {
    console.error('[Ghost API] Error al guardar en DDBB:', err);
    throw createError({
      statusCode: 500,
      statusMessage: 'Error saving to database'
    })
  }
})
