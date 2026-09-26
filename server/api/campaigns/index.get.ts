import { db } from '~/server/db/index'
import { campaigns, lists } from '~/server/db/schema'
import { eq, desc, and } from 'drizzle-orm'

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
      confirmedOpenCount: campaigns.confirmedOpenCount,
      bounceCount: campaigns.bounceCount,
      unsubscribeCount: campaigns.unsubscribeCount,
      complaintCount: campaigns.complaintCount,
      kind: campaigns.kind,
      pauseReason: campaigns.pauseReason,
    })
    .from(campaigns)
    .leftJoin(lists, eq(lists.id, campaigns.listId))
    .orderBy(desc(campaigns.createdAt))

  // Automation/transactional carriers are internal — hidden unless asked for
  const kind = query.kind === 'all' ? null : String(query.kind || 'regular')
  const conds = [
    ...(status ? [eq(campaigns.status, status as any)] : []),
    ...(kind ? [eq(campaigns.kind, kind as any)] : []),
  ]
  if (conds.length) q = q.where(and(...conds)) as any

  return await q
})
