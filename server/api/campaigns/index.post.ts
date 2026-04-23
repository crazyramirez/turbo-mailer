import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, subject, templateName, templateHtml, listId } = body

  if (!name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })
  if (!subject?.trim()) throw createError({ statusCode: 400, statusMessage: 'subject required' })

  const [row] = await db.insert(campaigns).values({
    name: name.trim(),
    subject: subject.trim(),
    templateName: templateName || null,
    templateHtml: templateHtml || null,
    listId: listId ? Number(listId) : null,
    status: 'draft',
    createdAt: new Date(),
  }).returning()

  return row
})
