import { db } from '~/server/db/index'
import { contacts, listContacts, lists } from '~/server/db/schema'
import { eq, and, sql, desc, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const perPage = 50
  const search = String(query.search || '')
  const listId = query.list_id ? Number(query.list_id) : null
  const status = query.status ? String(query.status) : null
  const offset = (page - 1) * perPage

  // Common filters — search across every text field of the contact
  const filters = []
  if (search) {
    // Escape LIKE wildcards so a literal % or _ in the query doesn't match everything
    const term = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const searchable = [
      contacts.email, contacts.name, contacts.company, contacts.role,
      contacts.phone, contacts.linkedin, contacts.url, contacts.youtube,
      contacts.instagram, contacts.tags,
    ]
    filters.push(
      sql`(${sql.join(searchable.map(f => sql`${f} LIKE ${term} ESCAPE '\\'`), sql` OR `)})`
    )
  }
  if (status && status !== 'all') {
    filters.push(eq(contacts.status, status as any))
  }

  let rows: any[] = []
  let total = 0

  if (listId) {
    // 1. Query for a specific list
    const results = await db.select({ contact: contacts })
      .from(contacts)
      .innerJoin(listContacts, eq(listContacts.contactId, contacts.id))
      .where(and(eq(listContacts.listId, listId), ...filters))
      .orderBy(desc(contacts.createdAt))
      .limit(perPage)
      .offset(offset)
    
    rows = results.map(r => r.contact)

    const countRes = await db.select({ count: sql<number>`count(*)` })
      .from(listContacts)
      .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
      .where(and(eq(listContacts.listId, listId), ...filters))
    total = Number(countRes[0]?.count || 0)
  } else {
    // 2. Query for ALL contacts
    const results = await db.select({ contact: contacts })
      .from(contacts)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(contacts.createdAt))
      .limit(perPage)
      .offset(offset)
    
    rows = results.map(r => r.contact)

    const countRes = await db.select({ count: sql<number>`count(*)` })
      .from(contacts)
      .where(filters.length ? and(...filters) : undefined)
    total = Number(countRes[0]?.count || 0)
  }

  // 3. Enrich with list memberships
  let contactListMap: Record<number, { id: number; name: string; color: string }[]> = {}
  if (rows.length > 0) {
    const ids = rows.map((c: any) => c.id)
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
      contactListMap[m.contactId].push({ 
        id: m.listId, 
        name: m.listName, 
        color: m.listColor ?? '#6366f1' 
      })
    }
  }

  return {
    data: rows.map((c: any) => ({ 
      ...c, 
      lists: contactListMap[c.id] ?? [] 
    })),
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  }
})
