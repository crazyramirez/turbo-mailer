import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

// Distinct tags among active contacts of a list, with usage counts.
// Feeds the campaign segmentation selector.
export default defineEventHandler(async (event) => {
  const listId = Number(getRouterParam(event, 'id'))
  if (!listId) throw createError({ statusCode: 400, statusMessage: 'Invalid list id' })

  const rows = await db
    .select({ tags: contacts.tags })
    .from(contacts)
    .innerJoin(listContacts, and(
      eq(listContacts.contactId, contacts.id),
      eq(listContacts.listId, listId),
    ))
    .where(eq(contacts.status, 'active'))

  const counts = new Map<string, { tag: string; count: number }>()
  for (const r of rows) {
    if (!Array.isArray(r.tags)) continue
    for (const raw of r.tags) {
      const tag = String(raw).trim()
      if (!tag) continue
      const key = tag.toLowerCase()
      const entry = counts.get(key)
      if (entry) entry.count++
      else counts.set(key, { tag, count: 1 })
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count)
})
