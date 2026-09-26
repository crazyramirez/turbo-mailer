import { requireApiKey } from '~/server/utils/api-keys'
import { sendStatus } from '~/server/utils/transactional'

// GET /api/v1/sends/:id — delivery status and events of a send.
export default defineEventHandler((event) => {
  requireApiKey(event, 'send')
  const s = sendStatus(Number(getRouterParam(event, 'id')))
  if (!s) throw createError({ statusCode: 404, statusMessage: 'Send not found' })
  return s
})
