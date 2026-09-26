import { sqlite } from '~/server/db/index'
import { verifyUnsubscribeTokenForOptOut } from '~/server/utils/auth'
import { loadSendContext } from '~/server/utils/subscription'

export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const query = getQuery(event)
  const sendId = Number(query.s)
  const token = String(query.t || '')

  if (!sendId || !token) throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  if (!verifyUnsubscribeTokenForOptOut(sendId, token, String(config.unsubscribeSecret))) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const ctx = loadSendContext(sendId)
  if (!ctx?.contact) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  const row = sqlite.prepare('SELECT preferences, topic_opt_outs AS topicOptOuts FROM contacts WHERE id = ?')
    .get(ctx.contact.id) as { preferences: string | null; topicOptOuts: string | null }
  const parse = <T>(v: string | null, fb: T): T => { try { return v ? JSON.parse(v) : fb } catch { return fb } }

  const topics = sqlite.prepare('SELECT id, name, description FROM topics WHERE is_public = 1 ORDER BY sort_order, id').all()

  const [local, domain] = ctx.contact.email.split('@')
  return {
    maskedEmail: `${local?.[0] ?? ''}***@${domain ?? ''}`,
    status: ctx.contact.status,
    preferences: parse(row.preferences, { frequency: 'all' }),
    topics,
    topicOptOuts: parse<number[]>(row.topicOptOuts, []),
  }
})
