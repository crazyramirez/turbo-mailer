import { db } from '~/server/db/index'
import { contacts, listContacts, lists } from '~/server/db/schema'
import { eq, like, and, sql, desc, inArray } from 'drizzle-orm'

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

  const mainContacts: any[] = listId ? rows.map((r: any) => r.contacts ?? r) : rows

  let contactListMap: Record<number, { id: number; name: string; color: string }[]> = {}
  if (mainContacts.length > 0) {
    const ids = mainContacts.map((c: any) => c.id)
    const memberships = await db
      .select({
        contactId: listContacts.contactId,
        listId: lists.id,
        listName: lists.name,
        listColor: lists.color,
      })
      .from(listContacts)
      .innerJoin(lists, eq(lists.id, listContacts.listId))
      .where(inArray(listContacts.contactId, ids))
    for (const m of memberships) {
      if (!contactListMap[m.contactId]) contactListMap[m.contactId] = []
      contactListMap[m.contactId].push({ id: m.listId, name: m.listName, color: m.listColor ?? '#6366f1' })
    }
  }

  return {
    data: mainContacts.map((c: any) => ({ ...c, lists: contactListMap[c.id] ?? [] })),
    total: count,
    page,
    perPage,
    totalPages: Math.ceil(count / perPage),
  }
})
