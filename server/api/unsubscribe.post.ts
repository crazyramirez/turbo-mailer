import { db } from '~/server/db/index'
import { contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  const secret = event.headers.get('x-api-key') || event.headers.get('authorization')?.replace('Bearer ', '') || ''

  if (!config.apiSecret || secret !== config.apiSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { email } = body

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'email is required' })
  }

  try {
    const [existing] = await db.select().from(contacts).where(eq(contacts.email, email))

    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Contact not found' })
    }

    const [updated] = await db.update(contacts).set({
      status: 'unsubscribed',
      updatedAt: new Date(),
    }).where(eq(contacts.id, existing.id)).returning()

    return updated
  } catch (e: any) {
    throw e
  }
})
