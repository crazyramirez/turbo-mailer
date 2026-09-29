import { sqlite } from '~/server/db/index'
import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { brandBrief } from '~/server/utils/ai/brand-kit'
import { decodeEntities, htmlToText } from '~/server/utils/html-to-text'

// AI pre-send review: reads the email like a meticulous editor would —
// typos, broken promises between text and link, missing CTA, tone vs brand,
// risky claims, accessibility. Complements (does not replace) the rule-based
// precheck. Each issue may carry an `edit` (find → replace) that
// /api/campaigns/:id/apply-edits applies with one click.

export interface ReviewEdit {
  target: 'subject' | 'subjectB' | 'preheader' | 'body' | 'none'
  find: string
  replace: string
  occurrence: number
}

export interface ReviewIssue {
  severity: 'high' | 'medium' | 'low'
  category: string
  problem: string
  fix: string
  edit: ReviewEdit
}

const plain = (s: string) => decodeEntities(decodeEntities(s)).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

export default defineEventHandler(async (event) => {
  const { campaignId } = await readBody<{ campaignId?: number }>(event)
  const c = sqlite.prepare('SELECT subject, subject_b AS subjectB, preheader, template_html AS html FROM campaigns WHERE id = ?')
    .get(Number(campaignId)) as { subject: string; subjectB: string | null; preheader: string | null; html: string | null } | undefined
  if (!c?.html) throw createError({ statusCode: 404, statusMessage: 'Campaña sin contenido' })

  const links = [...c.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => `«${plain(m[2]).slice(0, 80)}» → ${decodeEntities(m[1])}`).slice(0, 40)
  const images = [...c.html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0])
    .map((tag) => {
      const alt = tag.match(/alt=["']([^"']*)/i)?.[1]
      return `src=${tag.match(/src=["']([^"']+)/i)?.[1] ?? '?'} alt=${alt === undefined ? '(sin alt)' : `«${plain(alt)}»`}`
    }).slice(0, 30)

  try {
    const result = await aiJson<{ verdict: string; issues: ReviewIssue[] }>({
      feature: 'ai_review',
      effort: 'high',
      maxTokens: 8000,
      system: [
        'Eres el revisor final de campañas de email de una agencia exigente. Encuentra problemas REALES antes de que el email salga: errores ortográficos o gramaticales, frases confusas, incoherencias (el texto promete algo que el enlace no lleva), CTA ausente o débil, varios botones con el mismo texto genérico, datos/precios contradictorios, afirmaciones arriesgadas o no demostrables, tono inconsistente con la marca, problemas de accesibilidad (alt vacíos en imágenes con contenido, enlaces "haz clic aquí"), variables {{...}} mal escritas.',
        'No inventes problemas: si algo está bien, no lo menciones. Cada issue: severity (high = no enviar así; medium = debería corregirse; low = mejora opcional), category, problem (concreto, citando el texto), fix (texto sugerido listo para pegar).',
        'Cómo funciona la plataforma (no lo reportes como problema): variables {{name}}, {{company}}/{{Empresa}}, {{city}}, {{role}}… con respaldo opcional {{company | "tu equipo"}}; si una variable sin respaldo está vacía no se muestra y se limpia la puntuación de alrededor ("{{Empresa}}, ¿qué…" pasa a "¿Qué…"). {{UNSUBSCRIBE_URL}}, {{PREFERENCES_URL}} y {{COMPANY_ADDRESS}} los rellena el envío. Las imágenes llevan como alt el título de su tarjeta a propósito (se ve si el cliente bloquea imágenes): TEXTO no repite los alt, así que no es contenido duplicado. La compatibilidad técnica (CSS, formatos de imagen) la revisa otra herramienta: no la comentes.',
        'edit: la corrección como reemplazo mecánico, si se puede. target: subject | subjectB | preheader | body (texto visible) | none. find: fragmento EXACTO y continuo tal como aparece en ASUNTO, PREHEADER o TEXTO (sin la URL entre paréntesis que TEXTO añade a los enlaces, sin cruzar de un párrafo, título o botón a otro). replace: el texto nuevo (vacío para borrar). occurrence: 0 = todas las apariciones, N = solo la N-ésima (p. ej. 2 para cambiar solo el segundo botón repetido). Si la corrección no es un reemplazo de texto (cambiar un enlace, una imagen, la estructura), usa target none con find y replace vacíos.',
        'verdict: una frase de resumen. Responde en el idioma del email.',
        brandBrief(),
      ].filter(Boolean).join('\n'),
      messages: [{
        role: 'user',
        content: [
          `ASUNTO: ${c.subject}`,
          c.subjectB ? `ASUNTO B: ${c.subjectB}` : '',
          c.preheader ? `PREHEADER: ${c.preheader}` : '',
          `TEXTO:\n${htmlToText(c.html.replace(/<div\b[^>]*data-email-preheader[^>]*>[\s\S]*?<\/div>/i, '')).slice(0, 15000)}`,
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
              required: ['severity', 'category', 'problem', 'fix', 'edit'],
              properties: {
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                category: { type: 'string' },
                problem: { type: 'string' },
                fix: { type: 'string' },
                edit: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['target', 'find', 'replace', 'occurrence'],
                  properties: {
                    target: { type: 'string', enum: ['subject', 'subjectB', 'preheader', 'body', 'none'] },
                    find: { type: 'string' },
                    replace: { type: 'string' },
                    occurrence: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    })
    // An edit is only offered when it can actually be applied
    for (const issue of result.issues) {
      const e = issue.edit
      if (!e || e.target === 'none' || !e.find?.trim() || e.find === e.replace || (e.target === 'subjectB' && !c.subjectB)) {
        issue.edit = { target: 'none', find: '', replace: '', occurrence: 0 }
      }
    }
    return result
  } catch (err) {
    aiHttpError(err)
  }
})
