import { db } from '~/server/db/index'
import { lists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { name, description, color } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  const [row] = await db.update(lists)
    .set({ name: name.trim(), description: description?.trim() || null, color: color || '#6366f1' })
    .where(eq(lists.id, id))
    .returning()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'List not found' })
  return row
})
