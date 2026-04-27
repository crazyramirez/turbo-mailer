import { db } from '~/server/db/index'
import { campaigns } from '~/server/db/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, subject, templateName, templateHtml, listId,
    unsubEmailSubject, unsubEmailMessage, resubEmailSubject, resubEmailMessage } = body

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
    unsubEmailSubject: unsubEmailSubject?.trim() || null,
    unsubEmailMessage: unsubEmailMessage?.trim() || null,
    resubEmailSubject: resubEmailSubject?.trim() || null,
    resubEmailMessage: resubEmailMessage?.trim() || null,
    // Explicitly reset stats and state for new/cloned campaigns
    totalRecipients: 0,
    sentCount: 0,
    openCount: 0,
    clickCount: 0,
    failCount: 0,
    startedAt: null,
    finishedAt: null,
    scheduledAt: null,
  }).returning()

  return row
})
