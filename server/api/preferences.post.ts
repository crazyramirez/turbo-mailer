import { sqlite } from '~/server/db/index'
import { verifyUnsubscribeTokenForOptOut, getClientIp } from '~/server/utils/auth'
import { loadSendContext, performUnsubscribe, sendUnsubscribeConfirmation } from '~/server/utils/subscription'

// Preference center: email frequency, topic opt-outs, or a full unsubscribe.
export default defineEventHandler(async (event) => {
  const config = useServerConfig()
  if (!config.unsubscribeSecret) {
    throw createError({ statusCode: 500, statusMessage: 'UNSUBSCRIBE_SECRET not configured' })
  }

  const body = await readBody(event)
  const { s, t, frequency, unsubscribeAll, topicOptOuts } = body ?? {}
  const sendId = Number(s)
  const token = String(t || '')

  if (!sendId || !token) throw createError({ statusCode: 400, statusMessage: 'Missing params' })
  if (!verifyUnsubscribeTokenForOptOut(sendId, token, String(config.unsubscribeSecret))) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const ctx = loadSendContext(sendId)
  if (!ctx?.contact) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  const row = sqlite.prepare('SELECT preferences, topic_opt_outs AS topicOptOuts, status FROM contacts WHERE id = ?')
    .get(ctx.contact.id) as { preferences: string | null; topicOptOuts: string | null; status: string }
  const prefs = (() => { try { return JSON.parse(row.preferences || '{}') || {} } catch { return {} } })()

  if (frequency && ['all', 'weekly', 'monthly'].includes(frequency)) {
    prefs.frequency = frequency
  }

  let outs: number[] | undefined
  if (Array.isArray(topicOptOuts)) {
    const valid = new Set((sqlite.prepare('SELECT id FROM topics').all() as { id: number }[]).map(r => r.id))
    outs = [...new Set(topicOptOuts.map(Number).filter(n => valid.has(n)))]
  }

  sqlite.prepare(`UPDATE contacts SET preferences = ?, topic_opt_outs = COALESCE(?, topic_opt_outs), updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(prefs), outs ? JSON.stringify(outs) : null, Math.floor(Date.now() / 1000), ctx.contact.id)

  let status = row.status
  if (unsubscribeAll === true && row.status !== 'unsubscribed') {
    // Opt-outs are never rate limited
    performUnsubscribe(ctx, { source: 'preferences', ip: getClientIp(event), userAgent: getHeader(event, 'user-agent') ?? null })
    sendUnsubscribeConfirmation(ctx, config).catch(err =>
      console.warn('[preferences] confirmation email failed:', err?.message))
    status = 'unsubscribed'
  }

  return { ok: true, status, preferences: prefs, topicOptOuts: outs ?? null }
})
