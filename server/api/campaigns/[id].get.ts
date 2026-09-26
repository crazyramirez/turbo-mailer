import { db } from '~/server/db/index'
import { campaigns, lists, segments, topics } from '~/server/db/schema'
import { eq, getTableColumns } from 'drizzle-orm'
import { getRunInfo } from '~/server/utils/send-engine'

// Returns EVERY campaign column. It used to return a hand-picked subset that
// omitted subjectB, tagFilter, the follow-up settings... — the page then PUT
// that incomplete object back and silently wiped them on the next save.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  const [row] = await db
    .select({
      ...getTableColumns(campaigns),
      listName: lists.name,
      segmentName: segments.name,
      topicName: topics.name,
    })
    .from(campaigns)
    .leftJoin(lists, eq(lists.id, campaigns.listId))
    .leftJoin(segments, eq(segments.id, campaigns.segmentId))
    .leftJoin(topics, eq(topics.id, campaigns.topicId))
    .where(eq(campaigns.id, id))

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return { ...row, engine: getRunInfo(id) }
})
