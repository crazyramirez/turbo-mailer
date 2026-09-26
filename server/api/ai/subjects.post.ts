import { sqlite } from '~/server/db/index'
import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { brandBrief } from '~/server/utils/ai/brand-kit'
import { analyzeContent } from '~/server/utils/content-score'
import { htmlToText } from '~/server/utils/html-to-text'

// Subject lab: N subject + preheader proposals with different angles, each
// checked against the same spam-signal analysis the precheck uses, plus a
// predicted-performance score learned from this sender's own history.

interface Proposal { subject: string; preheader: string; angle: string; why: string }

function historyExamples(): { best: string[]; worst: string[]; avgCtr: number } {
  const rows = sqlite.prepare(
    `SELECT subject, sent_count AS sent, click_count AS clicks FROM campaigns
     WHERE status = 'sent' AND kind = 'regular' AND COALESCE(sent_count, 0) >= 50 ORDER BY finished_at DESC LIMIT 60`,
  ).all() as { subject: string; sent: number; clicks: number }[]
  const scored = rows.map(r => ({ s: r.subject, ctr: r.clicks / r.sent })).sort((a, b) => b.ctr - a.ctr)
  const avg = scored.length ? scored.reduce((a, b) => a + b.ctr, 0) / scored.length : 0
  return { best: scored.slice(0, 5).map(x => x.s), worst: scored.slice(-3).map(x => x.s), avgCtr: avg }
}

function heuristicScore(subject: string, preheader: string): { score: number; notes: string[] } {
  const notes: string[] = []
  let score = 70
  const len = subject.length
  if (len >= 25 && len <= 55) score += 8
  else if (len > 70) { score -= 12; notes.push('length') }
  if (/\{\{\s*(name|nombre)/i.test(subject)) score += 4
  if (/\d/.test(subject)) score += 3
  if (/\?$/.test(subject.trim())) score += 2
  if (preheader && preheader.toLowerCase() !== subject.toLowerCase() && preheader.length >= 30) score += 5
  const risk = analyzeContent({ subject, html: '<p>x</p><a href="{{UNSUBSCRIBE_URL}}">baja</a>', preheader }).findings
    .filter(f => f.id.startsWith('subject') || f.id === 'phrase')
  for (const f of risk) { score -= Math.round(f.weight * 8); notes.push(f.id) }
  return { score: Math.max(0, Math.min(100, score)), notes }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ campaignId?: number; subject?: string; count?: number; goal?: string }>(event)
  const count = Math.min(10, Math.max(3, Number(body?.count) || 8))
  let subject = String(body?.subject || '')
  let content = ''
  if (body?.campaignId) {
    const c = sqlite.prepare('SELECT subject, template_html AS html FROM campaigns WHERE id = ?').get(Number(body.campaignId)) as { subject: string; html: string | null } | undefined
    if (!c) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
    subject = subject || c.subject
    content = htmlToText(c.html || '').replace(/\s+/g, ' ').slice(0, 5000)
  }
  if (!subject && !content) throw createError({ statusCode: 400, statusMessage: 'Indica un asunto o una campaña' })

  const hist = historyExamples()
  try {
    const out = await aiJson<{ proposals: Proposal[] }>({
      feature: 'subject_lab',
      effort: 'medium',
      maxTokens: 6000,
      system: [
        'Eres especialista en asuntos de email con obsesión por la tasa de apertura y de clic HONESTA: nada de clickbait engañoso, ni MAYÚSCULAS, ni "!!!", ni RE:/FWD: falsos, ni palabras típicas de spam.',
        `Propón exactamente ${count} combinaciones asunto + preheader con ángulos distintos (curiosidad, beneficio concreto, número/dato, pregunta, urgencia real, prueba social, personalización con {{name | "fallback"}}...). Asunto ≤ 60 caracteres; preheader 40-90 que complemente sin repetir.`,
        'Escribe en el idioma del asunto/contenido original. "why": una frase explicando por qué funcionaría.',
        brandBrief(),
      ].filter(Boolean).join('\n'),
      messages: [{
        role: 'user',
        content: [
          subject && `Asunto actual: ${subject}`,
          content && `Contenido del email:\n${content}`,
          body?.goal && `Objetivo: ${body.goal}`,
          hist.best.length >= 3 && `Asuntos que MEJOR funcionaron con esta audiencia:\n- ${hist.best.join('\n- ')}\nLos que PEOR:\n- ${hist.worst.join('\n- ')}`,
        ].filter(Boolean).join('\n\n'),
      }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['proposals'],
        properties: {
          proposals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['subject', 'preheader', 'angle', 'why'],
              properties: {
                subject: { type: 'string' },
                preheader: { type: 'string' },
                angle: { type: 'string' },
                why: { type: 'string' },
              },
            },
          },
        },
      },
    })
    const proposals = out.proposals.slice(0, count).map(p => ({ ...p, ...heuristicScore(p.subject, p.preheader) }))
      .sort((a, b) => b.score - a.score)
    return { proposals, current: subject ? { subject, ...heuristicScore(subject, '') } : null }
  } catch (err) {
    aiHttpError(err)
  }
})
