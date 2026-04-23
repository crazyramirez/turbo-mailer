import { db } from '~/server/db/index'
import { lists } from '~/server/db/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, description, color } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  const [row] = await db.insert(lists).values({
    name: name.trim(),
    description: description?.trim() || null,
    color: color || '#6366f1',
    createdAt: new Date(),
  }).returning()

  return row
})
