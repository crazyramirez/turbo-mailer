import { db } from '~/server/db/index'
import { lists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  await db.delete(lists).where(eq(lists.id, id))
  return { success: true }
})
