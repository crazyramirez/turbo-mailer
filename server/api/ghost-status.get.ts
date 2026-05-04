import { db } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const config = useRuntimeConfig(event)
  
  // Si no es una consulta pública y no tiene la llave, denegar
  if (!query.public && query.portal !== config.public.portalKey) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found'
    })
  }

  const result = await db.select().from(settings).where(eq(settings.key, 'ghost_setup_seen')).get()
  
  return {
    seen: result?.value === '1',
    portalKey: query.public ? config.public.portalKey : null // Solo devolvemos la llave si es la consulta inicial de setup
  }
})
