import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { name, subject, templateName, templateHtml, listId, status, scheduledAt } = body

  const [row] = await db.update(campaigns).set({
    name: name?.trim(),
    subject: subject?.trim(),
    templateName: templateName || null,
    templateHtml: templateHtml || null,
    listId: listId ? Number(listId) : null,
    status: status || 'draft',
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  }).where(eq(campaigns.id, id)).returning()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return row
})
