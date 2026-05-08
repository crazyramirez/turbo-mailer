import { db } from '~/server/db/index'
import { sends, contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { verifyUnsubscribeToken } from '~/server/utils/auth'
import { checkAndIncrementSubLimit } from '~/server/utils/sub-rate-limit'

export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const body = await readBody(event)
  const { s, t, frequency, unsubscribeAll } = body ?? {}

  const sendId = Number(s)
  const token = String(t || '')

  if (!sendId || !token) throw createError({ statusCode: 400, statusMessage: 'Missing params' })

  if (!verifyUnsubscribeToken(sendId, token, config.unsubscribeSecret as string)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const [send] = await db.select().from(sends).where(eq(sends.id, sendId))
  if (!send) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const [contact] = await db.select().from(contacts).where(eq(contacts.email, send.email))
  if (!contact) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  const prefs = contact.preferences ?? {}

  if (frequency && ['all', 'weekly', 'monthly'].includes(frequency)) {
    prefs.frequency = frequency
  }

  const updates: Record<string, any> = {
    preferences: prefs,
    updatedAt: new Date(),
  }

  if (unsubscribeAll === true && contact.status !== 'unsubscribed') {
    const limit = await checkAndIncrementSubLimit(contact.id)
    if (!limit.allowed) {
      const resetInHours = limit.resetAt ? Math.ceil((limit.resetAt.getTime() - Date.now()) / 3_600_000) : 1
      throw createError({ statusCode: 429, statusMessage: `Rate limited. Retry in ${resetInHours}h.` })
    }
    updates.status = 'unsubscribed'
  }

  await db.update(contacts).set(updates).where(eq(contacts.id, contact.id))

  return { ok: true, status: updates.status ?? contact.status, preferences: prefs }
})
