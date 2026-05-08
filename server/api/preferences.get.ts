import { db } from '~/server/db/index'
import { sends, contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyUnsubscribeToken } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const query = getQuery(event)
  const sendId = Number(query.s)
  const token = String(query.t || '')

  if (!sendId || !token) throw createError({ statusCode: 400, statusMessage: 'Missing params' })

  if (!verifyUnsubscribeToken(sendId, token, config.unsubscribeSecret as string)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
  if (!send) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const [contact] = await db.select({
    email: contacts.email,
    name: contacts.name,
    status: contacts.status,
    preferences: contacts.preferences,
  }).from(contacts).where(eq(contacts.email, send.email))
  if (!contact) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  // Mask email: j***@domain.com
  const [local, domain] = contact.email.split('@')
  const maskedEmail = `${local[0]}***@${domain}`

  return {
    maskedEmail,
    status: contact.status,
    preferences: contact.preferences ?? { frequency: 'all' },
  }
})
