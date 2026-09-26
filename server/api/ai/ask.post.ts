import { sqlite } from '~/server/db/index'
import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { providerOf } from '~/server/utils/send-limiter'

// "Ask your data": natural-language questions answered from a read-only
// snapshot of aggregated metrics. No SQL is generated or executed from the
// question — the model only sees numbers we computed.

function dataPack() {
  const campaigns = sqlite.prepare(
    `SELECT id, name, subject, strftime('%Y-%m-%d %H:%M', started_at, 'unixepoch', 'localtime') AS date,
            strftime('%w', started_at, 'unixepoch', 'localtime') AS weekday,
            sent_count AS sent, confirmed_open_count AS opens, click_count AS clicks,
            unsubscribe_count AS unsubs, complaint_count AS complaints, bounce_count AS bounces
     FROM campaigns WHERE status IN ('sent', 'sending', 'paused') AND kind = 'regular' AND COALESCE(sent_count, 0) > 0
     ORDER BY started_at DESC LIMIT 60`,
  ).all() as any[]

  const byWeekday = sqlite.prepare(
    `SELECT strftime('%w', created_at, 'unixepoch', 'localtime') AS d, COUNT(DISTINCT send_id) AS n FROM tracking_events
     WHERE created_at > strftime('%s', 'now', '-180 days') AND (event_type = 'click' OR (event_type = 'open' AND COALESCE(is_proxy, 0) = 0))
     GROUP BY d`,
  ).all()
  const byHour = sqlite.prepare(
    `SELECT CAST(strftime('%H', created_at, 'unixepoch', 'localtime') AS INTEGER) AS h, COUNT(DISTINCT send_id) AS n FROM tracking_events
     WHERE created_at > strftime('%s', 'now', '-180 days') AND (event_type = 'click' OR (event_type = 'open' AND COALESCE(is_proxy, 0) = 0))
     GROUP BY h`,
  ).all()
  const growth = sqlite.prepare(
    `SELECT strftime('%Y-%m', created_at, 'unixepoch') AS month, COUNT(*) AS newContacts FROM contacts
     WHERE created_at > strftime('%s', 'now', '-365 days') GROUP BY month ORDER BY month`,
  ).all()
  const contacts = sqlite.prepare(`SELECT status, COUNT(*) AS n FROM contacts GROUP BY status`).all()
  const lists = sqlite.prepare(
    `SELECT l.name, COUNT(lc.contact_id) AS size FROM lists l LEFT JOIN list_contacts lc ON lc.list_id = l.id GROUP BY l.id ORDER BY size DESC LIMIT 20`,
  ).all()
  const engagement = sqlite.prepare(
    `SELECT CASE WHEN engagement_score >= 60 THEN 'alto' WHEN engagement_score >= 25 THEN 'medio' ELSE 'bajo' END AS tier, COUNT(*) AS n
     FROM contacts WHERE status = 'active' GROUP BY tier`,
  ).all()
  const topLinks = sqlite.prepare(
    `SELECT url, COUNT(DISTINCT send_id) AS clickers FROM tracking_events WHERE event_type = 'click' AND created_at > strftime('%s', 'now', '-90 days')
     GROUP BY url ORDER BY clickers DESC LIMIT 10`,
  ).all()
  const domains = sqlite.prepare(
    `SELECT LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain, COUNT(*) AS sent,
            COUNT(*) FILTER (WHERE status = 'opened' AND COALESCE(opened_by_proxy, 0) = 0) AS opens,
            COUNT(*) FILTER (WHERE status = 'bounced') AS bounces
     FROM sends WHERE sent_at > strftime('%s', 'now', '-90 days') GROUP BY domain`,
  ).all() as { domain: string; sent: number; opens: number; bounces: number }[]
  const providers: Record<string, { sent: number; opens: number; bounces: number }> = {}
  for (const d of domains) {
    const p = providerOf(`x@${d.domain}`)
    providers[p] ??= { sent: 0, opens: 0, bounces: 0 }
    providers[p].sent += d.sent; providers[p].opens += d.opens; providers[p].bounces += d.bounces
  }
  return { campaigns, engagementByWeekday_0isSunday: byWeekday, engagementByHour: byHour, contactGrowthByMonth: growth, contactsByStatus: contacts, lists, activeContactsByEngagement: engagement, topLinks90d: topLinks, deliveryByProvider90d: providers }
}

export default defineEventHandler(async (event) => {
  const { question, history } = await readBody<{ question?: string; history?: { role: 'user' | 'assistant'; content: string }[] }>(event)
  if (!question?.trim() || question.length > 1000) throw createError({ statusCode: 400, statusMessage: 'Pregunta vacía o demasiado larga' })
  const prior = (Array.isArray(history) ? history : []).slice(-6)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
  while (prior.length && prior[0].role === 'assistant') prior.shift()

  try {
    return await aiJson<{ answer: string; chart: { kind: 'none' | 'bar' | 'line'; title: string; labels: string[]; values: number[] } }>({
      feature: 'ask_data',
      effort: 'medium',
      maxTokens: 6000,
      system: [
        'Eres el analista de datos de esta cuenta de email marketing. Respondes preguntas usando EXCLUSIVAMENTE los datos JSON proporcionados (métricas agregadas; aperturas = confirmadas, sin prefetch de proxies). Si los datos no bastan, dilo claramente y sugiere qué medir.',
        'Respuesta breve y directa en el idioma de la pregunta (markdown simple: negritas y listas). Incluye cifras concretas. Si una gráfica ayuda, rellena chart (bar/line) con máximo 24 puntos; si no, kind="none" con arrays vacíos.',
        `DATOS:\n${JSON.stringify(dataPack())}`,
      ].join('\n\n'),
      messages: [...prior, { role: 'user', content: question.trim() }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['answer', 'chart'],
        properties: {
          answer: { type: 'string' },
          chart: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'title', 'labels', 'values'],
            properties: {
              kind: { type: 'string', enum: ['none', 'bar', 'line'] },
              title: { type: 'string' },
              labels: { type: 'array', items: { type: 'string' } },
              values: { type: 'array', items: { type: 'number' } },
            },
          },
        },
      },
    })
  } catch (err) {
    aiHttpError(err)
  }
})
