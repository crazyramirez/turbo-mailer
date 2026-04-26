import { db } from '~/server/db/index'
import { contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

const MAX_CHANGES = 5
const WINDOW_MS = 60 * 60 * 1000 // 1h

export async function checkAndIncrementSubLimit(contactId: number): Promise<{ allowed: boolean; resetAt?: Date }> {
  const [contact] = await db
    .select({ subChangeCount: contacts.subChangeCount, subChangeWindowStart: contacts.subChangeWindowStart })
    .from(contacts)
    .where(eq(contacts.id, contactId))

  if (!contact) return { allowed: false }

  const now = new Date()
  const windowStart = contact.subChangeWindowStart

  if (!windowStart || now.getTime() - windowStart.getTime() > WINDOW_MS) {
    await db.update(contacts)
      .set({ subChangeCount: 1, subChangeWindowStart: now })
      .where(eq(contacts.id, contactId))
    return { allowed: true }
  }

  const count = contact.subChangeCount ?? 0
  if (count >= MAX_CHANGES) {
    const resetAt = new Date(windowStart.getTime() + WINDOW_MS)
    return { allowed: false, resetAt }
  }

  await db.update(contacts)
    .set({ subChangeCount: count + 1 })
    .where(eq(contacts.id, contactId))
  return { allowed: true }
}
