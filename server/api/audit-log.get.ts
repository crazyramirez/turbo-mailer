import { db } from '~/server/db/index'
import { auditLog } from '~/server/db/schema'
import { desc, like, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const perPage = Math.min(100, Math.max(1, Number(query.limit) || 50))
  const offset = (page - 1) * perPage
  const actionFilter = query.action ? String(query.action) : null

  const baseRows = db.select().from(auditLog).orderBy(desc(auditLog.createdAt))
  const baseCount = db.select({ total: sql<number>`COUNT(*)` }).from(auditLog)

  const rows = await (actionFilter
    ? baseRows.where(like(auditLog.action, `${actionFilter}%`))
    : baseRows
  ).limit(perPage).offset(offset)

  const [{ total }] = await (actionFilter
    ? baseCount.where(like(auditLog.action, `${actionFilter}%`))
    : baseCount
  )

  return { rows, total, page, limit: perPage }
})
