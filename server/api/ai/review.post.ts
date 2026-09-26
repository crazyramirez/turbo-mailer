import { sqlite } from '~/server/db/index'
import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { brandBrief } from '~/server/utils/ai/brand-kit'
import { htmlToText } from '~/server/utils/html-to-text'

// AI pre-send review: reads the email like a meticulous editor would —
// typos, broken promises between text and link, missing CTA, tone vs brand,
// risky claims, accessibility. Complements (does not replace) the rule-based
// precheck.

export default defineEventHandler(async (event) => {
  const { campaignId } = await readBody<{ campaignId?: number }>(event)
  const c = sqlite.prepare('SELECT subject, subject_b AS subjectB, preheader, template_html AS html FROM campaigns WHERE id = ?')
    .get(Number(campaignId)) as { subject: string; subjectB: string | null; preheader: string | null; html: string | null } | undefined
  if (!c?.html) throw createError({ statusCode: 404, statusMessage: 'Campaña sin contenido' })

  const links = [...c.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => `«${m[2].replace(/<[^>]+>/g, '').trim().slice(0, 80)}» → ${m[1]}`).slice(0, 40)
  const images = [...c.html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0])
    .map(tag => `src=${tag.match(/src=["']([^"']+)/i)?.[1] ?? '?'} alt=${tag.match(/alt=["']([^"']*)/i)?.[1] ?? '(sin alt)'}`).slice(0, 30)

  try {
    return await aiJson<{ verdict: string; issues: { severity: 'high' | 'medium' | 'low'; category: string; problem: string; fix: string }[] }>({
      feature: 'ai_review',
      effort: 'high',
      maxTokens: 8000,
      system: [
        'Eres el revisor final de campañas de email de una agencia exigente. Encuentra problemas REALES antes de que el email salga: errores ortográficos o gramaticales, frases confusas, incoherencias (el texto promete algo que el enlace no lleva), CTA ausente o débil, datos/precios contradictorios, afirmaciones arriesgadas o no demostrables, tono inconsistente con la marca, problemas de accesibilidad (alt vacíos en imágenes con contenido, "haz clic aquí"), variables {{...}} mal escritas.',
        'No inventes problemas: si algo está bien, no lo menciones. Cada issue: severity (high = no enviar así; medium = debería corregirse; low = mejora opcional), category, problem (concreto, citando el texto), fix (texto sugerido listo para pegar).',
        'verdict: una frase de resumen. Responde en el idioma del email.',
        brandBrief(),
      ].filter(Boolean).join('\n'),
      messages: [{
        role: 'user',
        content: [
          `ASUNTO: ${c.subject}`,
          c.subjectB ? `ASUNTO B: ${c.subjectB}` : '',
          c.preheader ? `PREHEADER: ${c.preheader}` : '',
          `TEXTO:\n${htmlToText(c.html).slice(0, 15000)}`,
          `ENLACES:\n${links.join('\n')}`,
          `IMÁGENES:\n${images.join('\n')}`,
        ].filter(Boolean).join('\n\n'),
      }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['verdict', 'issues'],
        properties: {
          verdict: { type: 'string' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['severity', 'category', 'problem', 'fix'],
              properties: {
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                category: { type: 'string' },
                problem: { type: 'string' },
                fix: { type: 'string' },
              },
            },
          },
        },
      },
    })
  } catch (err) {
    aiHttpError(err)
  }
})
