import { db } from '~/server/db/index'
import { lists, listContacts } from '~/server/db/schema'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const rows = await db
    .select({
      id: lists.id,
      name: lists.name,
      description: lists.description,
      color: lists.color,
      createdAt: lists.createdAt,
      contactCount: sql<number>`COUNT(${listContacts.contactId})`,
    })
    .from(lists)
    .leftJoin(listContacts, sql`${listContacts.listId} = ${lists.id}`)
    .groupBy(lists.id)
    .orderBy(lists.createdAt)

  return rows
})
