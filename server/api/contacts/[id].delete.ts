import { db } from '~/server/db/index'
import { contacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  await db.delete(contacts).where(eq(contacts.id, id))
  return { success: true }
})
