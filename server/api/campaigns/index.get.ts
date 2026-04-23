import { db } from '~/server/db/index'
import { campaigns, lists } from '~/server/db/schema'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const status = query.status ? String(query.status) : null

  let q = db
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
    })
    .from(campaigns)
    .leftJoin(lists, eq(lists.id, campaigns.listId))
    .orderBy(desc(campaigns.createdAt))

  if (status) q = q.where(eq(campaigns.status, status as any)) as any

  return await q
})
