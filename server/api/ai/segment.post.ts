import { sqlite } from '~/server/db/index'
import { aiJson, aiHttpError, type AiMessage } from '~/server/utils/ai/provider'
import { SEGMENT_OPS, validateSegment, countSegmentRules, type SegmentGroup } from '~/server/utils/segments'
import { listCustomFields } from '~/server/utils/custom-fields'

// "Contacts from Madrid who clicked in the last 30 days but never bought" →
// a validated rule tree. The model only picks from the catalog below; the
// result goes through the same validator as hand-built segments, and a
// rejected tree is sent back once with the validator's message.

interface AiRule { field: string; op: string; value: string }
interface AiOut {
  name: string
  explanation: string
  match: 'all' | 'any'
  rules: AiRule[]
  groups: { match: 'all' | 'any'; rules: AiRule[] }[]
}

const BUILTIN_KINDS: Record<string, string> = {
  email: 'string', email_domain: 'string', name: 'string', company: 'string', role: 'string', phone: 'string',
  locale: 'string', source: 'string', status: 'status', created_at: 'date', last_engaged_at: 'date',
  last_sent_at: 'date', engagement_score: 'number', sent_since_engaged: 'number', tags: 'tags', list: 'list',
  verification: 'verification', behavior: 'behavior',
}

const RULE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'op', 'value'],
  properties: { field: { type: 'string' }, op: { type: 'string' }, value: { type: 'string' } },
}

function toGroup(out: AiOut, kinds: Record<string, string>): SegmentGroup {
  const conv = (r: AiRule) => {
    const kind = kinds[r.field]
    const value = kind === 'tags'
      ? r.value.split(',').map(s => s.trim()).filter(Boolean)
      : r.value === '' ? undefined : r.value
    return { field: r.field, op: r.op, value }
  }
  return {
    match: out.match === 'any' ? 'any' : 'all',
    rules: [
      ...out.rules.map(conv),
      ...out.groups.filter(g => g.rules.length).map(g => ({ match: g.match === 'any' ? 'any' as const : 'all' as const, rules: g.rules.map(conv) })),
    ],
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ prompt?: string }>(event)
  const prompt = String(body?.prompt || '').trim().slice(0, 1000)
  if (prompt.length < 4) throw createError({ statusCode: 400, statusMessage: 'Describe el segmento que quieres' })

  const custom = listCustomFields()
  const kinds: Record<string, string> = { ...BUILTIN_KINDS }
  for (const d of custom) {
    kinds[`custom.${d.key}`] = d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : d.type === 'boolean' ? 'boolean' : 'string'
  }
  const lists = sqlite.prepare('SELECT id, name FROM lists ORDER BY name LIMIT 100').all() as { id: number; name: string }[]
  const campaigns = sqlite.prepare(`SELECT id, name, subject FROM campaigns WHERE kind = 'regular' AND status IN ('sent', 'sending', 'paused') ORDER BY id DESC LIMIT 40`).all() as { id: number; name: string; subject: string }[]
  const tags = sqlite.prepare(`SELECT j.value AS tag FROM contacts c, json_each(COALESCE(c.tags, '[]')) j GROUP BY LOWER(j.value) ORDER BY COUNT(*) DESC LIMIT 80`).all() as { tag: string }[]

  const catalog = [
    `Hoy es ${new Date().toISOString().slice(0, 10)}.`,
    'CAMPOS (campo: tipo → operadores):',
    ...Object.entries(kinds).map(([f, k]) => {
      const label = f.startsWith('custom.') ? ` («${custom.find(c => `custom.${c.key}` === f)?.label}»)` : ''
      return `- ${f}${label}: ${k} → ${SEGMENT_OPS[k as keyof typeof SEGMENT_OPS].join(', ')}`
    }),
    'VALORES: string → texto; number → número; date before/after → AAAA-MM-DD; within_days/older_than_days/anniversary_in_days → número de días;',
    'status → active|unsubscribed|bounced|inactive; verification → valid|risky|invalid; tags → etiquetas separadas por comas;',
    'list → id numérico de la lista; behavior *_campaign → id numérico de la campaña; clicked_url_contains → texto; *_within_days → días;',
    'empty/not_empty/is_true/is_false → value "".',
    `LISTAS: ${lists.map(l => `${l.id}=${l.name}`).join('; ') || '(ninguna)'}`,
    `CAMPAÑAS RECIENTES: ${campaigns.map(c => `${c.id}=${c.name} («${c.subject}»)`).join('; ') || '(ninguna)'}`,
    `ETIQUETAS EXISTENTES: ${tags.map(t => t.tag).join(', ') || '(ninguna)'}`,
  ].join('\n')

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'explanation', 'match', 'rules', 'groups'],
    properties: {
      name: { type: 'string' },
      explanation: { type: 'string' },
      match: { type: 'string', enum: ['all', 'any'] },
      rules: { type: 'array', items: RULE_SCHEMA },
      groups: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['match', 'rules'],
          properties: { match: { type: 'string', enum: ['all', 'any'] }, rules: { type: 'array', items: RULE_SCHEMA } },
        },
      },
    },
  }

  const system = [
    'Traduces descripciones de audiencias de email marketing a reglas de segmentación. Usa SOLO los campos, operadores, ids y etiquetas del catálogo; nunca inventes ids.',
    '"match" combina las reglas de primer nivel; usa "groups" para sub-condiciones con la lógica contraria (p. ej. todas estas Y alguna de estas).',
    '"Engaged/activos" = behavior engaged_within_days; "no abrieron la campaña X" = behavior not_opened_campaign; "compradores" suele ser una etiqueta si existe.',
    'Si algo no se puede expresar con el catálogo, omítelo y dilo en "explanation". "name": nombre corto del segmento. Responde en el idioma del usuario.',
    catalog,
  ].join('\n')

  const messages: AiMessage[] = [{ role: 'user', content: prompt }]
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await aiJson<AiOut>({ feature: 'segment_ai', effort: 'low', maxTokens: 3000, system, messages, schema })
      const group = toGroup(out, kinds)
      try {
        validateSegment(group)
        return { name: out.name.slice(0, 120), explanation: out.explanation, rules: group, count: countSegmentRules(group) }
      } catch (err: any) {
        messages.push({ role: 'assistant', content: JSON.stringify(out) })
        messages.push({ role: 'user', content: `Esas reglas no son válidas: ${err.message}. Corrígelas usando solo el catálogo.` })
      }
    }
    throw createError({ statusCode: 422, statusMessage: 'La IA no consiguió expresar ese segmento con los campos disponibles. Prueba a reformularlo.' })
  } catch (err: any) {
    if (err?.statusCode) throw err
    aiHttpError(err)
  }
})
