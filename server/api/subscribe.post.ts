import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { isValidEmail, sanitizeContactFields } from '~/server/utils/validate'
import { verifyApiKey } from '~/server/utils/auth'
import { sendConfirmationEmail } from '~/server/utils/confirm-email'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  const incoming = event.headers.get('x-api-key') || event.headers.get('authorization')?.replace('Bearer ', '') || ''

  if (!config.apiSecret || !incoming || !verifyApiKey(incoming, String(config.apiSecret))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const fields = sanitizeContactFields(body)
  const { tags, listIds } = body

  if (!fields.email) throw createError({ statusCode: 400, statusMessage: 'email is required' })
  if (!isValidEmail(fields.email)) throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })

  // Double opt-in (config.doubleOptIn / DOUBLE_OPT_IN): new contacts start as
  // 'inactive' and receive a confirmation email; /api/confirm activates them.
  const doubleOptIn = config.doubleOptIn === true || String(config.doubleOptIn).toLowerCase() === 'true'
  const smtpReady = Boolean(config.smtpHost && config.smtpUser && config.smtpPass && config.unsubscribeSecret)

  try {
    const [existing] = await db.select().from(contacts).where(eq(contacts.email, fields.email))

    if (existing) {
      // Re-subscribing an already-active contact just refreshes its data;
      // an inactive/bounced one goes through confirmation again under opt-in
      const needsConfirm = doubleOptIn && smtpReady && existing.status !== 'active'
      const [updated] = await db.update(contacts).set({
        ...fields,
        tags: Array.isArray(tags) ? tags : existing.tags,
        status: needsConfirm ? 'inactive' : 'active',
        updatedAt: new Date(),
      }).where(eq(contacts.id, existing.id)).returning()

      if (needsConfirm) {
        sendConfirmationEmail(updated.id, updated.email, updated.name, config)
          .catch(err => console.error('[subscribe] confirmation email failed:', err?.message))
      }
      return { ...updated, pendingConfirmation: needsConfirm }
    } else {
      const needsConfirm = doubleOptIn && smtpReady
      const [row] = await db.insert(contacts).values({
        ...fields,
        tags: Array.isArray(tags) ? tags : [],
        status: needsConfirm ? 'inactive' : 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning()

      if (Array.isArray(listIds) && listIds.length) {
        await db.insert(listContacts).values(listIds.map((listId: number) => ({ listId, contactId: row.id })))
      }

      if (needsConfirm) {
        sendConfirmationEmail(row.id, row.email, row.name, config)
          .catch(err => console.error('[subscribe] confirmation email failed:', err?.message))
      }
      return { ...row, pendingConfirmation: needsConfirm }
    }
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      throw createError({ statusCode: 409, statusMessage: 'Email already exists' })
    }
    throw e
  }
})
