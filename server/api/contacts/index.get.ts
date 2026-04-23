import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { eq, like, and, sql, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const perPage = 50
  const search = String(query.search || '')
  const listId = query.list_id ? Number(query.list_id) : null
  const status = query.status ? String(query.status) : null

  const conditions = []
  if (search) {
    conditions.push(sql`(${contacts.email} LIKE ${`%${search}%`} OR ${contacts.name} LIKE ${`%${search}%`} OR ${contacts.company} LIKE ${`%${search}%`})`)
  }
  if (status && status !== 'all') {
    conditions.push(eq(contacts.status, status as any))
  }

  let baseQuery = db.select().from(contacts)

  if (listId) {
    baseQuery = baseQuery.innerJoin(listContacts, and(
      eq(listContacts.contactId, contacts.id),
      eq(listContacts.listId, listId)
    )) as any
  }

  if (conditions.length) {
    baseQuery = baseQuery.where(and(...conditions)) as any
  }

  const rows = await (baseQuery as any)
    .orderBy(desc(contacts.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage)

  const countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(contacts)
  if (listId) {
    countQuery.innerJoin(listContacts, and(
      eq(listContacts.contactId, contacts.id),
      eq(listContacts.listId, listId)
    ))
  }
  if (conditions.length) countQuery.where(and(...conditions))

  const [{ count }] = await countQuery

  return {
    data: listId ? rows.map((r: any) => r.contacts ?? r) : rows,
    total: count,
    page,
    perPage,
    totalPages: Math.ceil(count / perPage),
  }
})
