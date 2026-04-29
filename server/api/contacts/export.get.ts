import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const listId = query.list_id ? Number(query.list_id) : null

  let rows
  if (listId) {
    rows = await db.select({ contacts })
      .from(contacts)
      .innerJoin(listContacts, and(
        eq(listContacts.contactId, contacts.id),
        eq(listContacts.listId, listId)
      ))
      .then(r => r.map(x => x.contacts))
  } else {
    rows = await db.select().from(contacts)
  }

  const headers = ['email', 'name', 'company', 'agency', 'role', 'phone', 'linkedin', 'url', 'youtube', 'instagram', 'status', 'tags']
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const val = r[h as keyof typeof r]
      const str = Array.isArray(val) ? val.join(';') : String(val ?? '')
      return `"${str.replace(/"/g, '""')}"`
    }).join(','))
  ].join('\n')

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="contacts-${Date.now()}.csv"`)

  return csv
})
