import { sqlite } from '~/server/db/index'
import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { providerOf } from '~/server/utils/send-limiter'

// Post-campaign analysis: what worked, what didn't, what to do next — from the
// campaign's real numbers compared with the sender's own averages. Cached on
// the campaign (aiInsights) until regenerated.

export default defineEventHandler(async (event) => {
  const { campaignId, refresh, language } = await readBody<{ campaignId?: number; refresh?: boolean; language?: string }>(event)
  const lang = String(language || 'es').toLowerCase().startsWith('en') ? 'inglés' : 'español'
  const id = Number(campaignId)
  const c = sqlite.prepare(
    `SELECT id, name, subject, subject_b AS subjectB, ab_winner AS abWinner, preheader, status, sent_count AS sent,
            confirmed_open_count AS opens, open_count AS rawOpens, click_count AS clicks, bounce_count AS bounces,
            complaint_count AS complaints, unsubscribe_count AS unsubs, fail_count AS failed, started_at AS startedAt,
            ai_insights AS insights, template_html AS html
     FROM campaigns WHERE id = ?`,
  ).get(id) as any
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  if (c.insights && !refresh) return JSON.parse(c.insights)
  if (!c.sent) throw createError({ statusCode: 400, statusMessage: 'La campaña aún no tiene envíos' })

  const avg = sqlite.prepare(
    `SELECT AVG(CAST(confirmed_open_count AS REAL) / sent_count) AS openRate, AVG(CAST(click_count AS REAL) / sent_count) AS clickRate,
            AVG(CAST(unsubscribe_count AS REAL) / sent_count) AS unsubRate, COUNT(*) AS n
     FROM campaigns WHERE status = 'sent' AND kind = 'regular' AND sent_count >= 50 AND id != ?`,
  ).get(id) as { openRate: number | null; clickRate: number | null; unsubRate: number | null; n: number }

  const links = sqlite.prepare(
    `SELECT url, COUNT(*) AS clicks, COUNT(DISTINCT send_id) AS uniq FROM tracking_events
     WHERE campaign_id = ? AND event_type = 'click' GROUP BY url ORDER BY uniq DESC LIMIT 10`,
  ).all(id) as { url: string; clicks: number; uniq: number }[]

  const byHour = sqlite.prepare(
    `SELECT CAST(strftime('%H', created_at, 'unixepoch', 'localtime') AS INTEGER) AS h, COUNT(DISTINCT send_id) AS n
     FROM tracking_events WHERE campaign_id = ? AND (event_type = 'click' OR (event_type = 'open' AND COALESCE(is_proxy, 0) = 0))
     GROUP BY h ORDER BY n DESC LIMIT 4`,
  ).all(id) as { h: number; n: number }[]

  const byDomain = sqlite.prepare(
    `SELECT LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain, COUNT(*) AS sent,
            COUNT(*) FILTER (WHERE status = 'opened' AND COALESCE(opened_by_proxy, 0) = 0) AS opens,
            COUNT(*) FILTER (WHERE status = 'bounced' OR bounce_class = 'block') AS failed
     FROM sends WHERE campaign_id = ? GROUP BY domain`,
  ).all(id) as { domain: string; sent: number; opens: number; failed: number }[]
  const providers: Record<string, { sent: number; opens: number; failed: number }> = {}
  for (const d of byDomain) {
    const p = providerOf(`x@${d.domain}`)
    providers[p] ??= { sent: 0, opens: 0, failed: 0 }
    providers[p].sent += d.sent; providers[p].opens += d.opens; providers[p].failed += d.failed
  }

  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(2)}%` : '—')
  const facts = [
    `Campaña «${c.name}» — asunto: «${c.subject}»${c.subjectB ? ` / B: «${c.subjectB}» (ganador: ${c.abWinner ?? 'sin decidir'})` : ''}`,
    `Entregados: ${c.sent} · aperturas confirmadas ${pct(c.opens, c.sent)} (brutas con proxies ${pct(c.rawOpens, c.sent)}) · clics ${pct(c.clicks, c.sent)} · CTOR ${pct(c.clicks, c.opens)} · bajas ${pct(c.unsubs, c.sent)} · quejas ${c.complaints} · rebotes ${c.bounces} · fallos ${c.failed}`,
    avg.n ? `Media histórica (${avg.n} campañas): apertura ${pct(avg.openRate ?? 0, 1)}, clic ${pct(avg.clickRate ?? 0, 1)}, bajas ${pct(avg.unsubRate ?? 0, 1)}` : 'Sin histórico suficiente para comparar.',
    links.length ? `Enlaces más clicados: ${links.map(l => `${l.url} (${l.uniq} únicos)`).join('; ')}` : 'Sin clics.',
    byHour.length ? `Horas con más interacción: ${byHour.map(h => `${h.h}h (${h.n})`).join(', ')}` : '',
    `Por proveedor: ${Object.entries(providers).map(([p, v]) => `${p}: ${v.sent} env, apertura ${pct(v.opens, v.sent)}, fallos ${v.failed}`).join('; ')}`,
  ].filter(Boolean).join('\n')

  try {
    const result = await aiJson<{ summary: string; wins: string[]; problems: string[]; recommendations: string[]; nextCampaignIdea: string }>({
      feature: 'campaign_insights',
      effort: 'medium',
      maxTokens: 6000,
      system: `Eres analista senior de email marketing. Interpretas resultados con honestidad (las aperturas brutas incluyen prefetch de Apple/Gmail; las confirmadas y los clics son la señal fiable). Conclusiones concretas y accionables basadas SOLO en los datos dados; si algo no se puede concluir, dilo. Responde en ${lang}.`,
      messages: [{ role: 'user', content: `${facts}\n\nContenido (resumen):\n${String(c.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000)}` }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'wins', 'problems', 'recommendations', 'nextCampaignIdea'],
        properties: {
          summary: { type: 'string' },
          wins: { type: 'array', items: { type: 'string' } },
          problems: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
          nextCampaignIdea: { type: 'string' },
        },
      },
    })
    const stored = { ...result, generatedAt: new Date().toISOString() }
    sqlite.prepare('UPDATE campaigns SET ai_insights = ? WHERE id = ?').run(JSON.stringify(stored), id)
    return stored
  } catch (err) {
    aiHttpError(err)
  }
})
