import { db } from '~/server/db/index'
import { campaigns, lists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  const [row] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      subject: campaigns.subject,
      templateName: campaigns.templateName,
      templateHtml: campaigns.templateHtml,
      listId: campaigns.listId,
      listName: lists.name,
      status: campaigns.status,
      scheduledAt: campaigns.scheduledAt,
      startedAt: campaigns.startedAt,
      finishedAt: campaigns.finishedAt,
      createdAt: campaigns.createdAt,
      totalRecipients: campaigns.totalRecipients,
      sentCount: campaigns.sentCount,
      openCount: campaigns.openCount,
      clickCount: campaigns.clickCount,
      failCount: campaigns.failCount,
      unsubEmailSubject: campaigns.unsubEmailSubject,
      unsubEmailMessage: campaigns.unsubEmailMessage,
      resubEmailSubject: campaigns.resubEmailSubject,
      resubEmailMessage: campaigns.resubEmailMessage,
    })
    .from(campaigns)
    .leftJoin(lists, eq(lists.id, campaigns.listId))
    .where(eq(campaigns.id, id))

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return row
})
