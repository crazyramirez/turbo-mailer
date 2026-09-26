import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { brandBrief } from '~/server/utils/ai/brand-kit'

// Translates a whole email (subject, preheader, HTML) keeping markup, links
// and merge tags untouched — verified before returning.

const skeleton = (html: string) => (html.match(/<\/?[a-z][a-z0-9-]*|href=["'][^"']*["']|src=["'][^"']*["']/gi) ?? []).join('|').toLowerCase()
const tags = (s: string) => (s.match(/\{\{[^}]+\}\}/g) ?? []).map(t => t.replace(/\s+/g, '').replace(/\|.*\}\}$/, '}}')).sort().join()

const LANGS: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán', it: 'italiano', ca: 'catalán', nl: 'neerlandés' }

export default defineEventHandler(async (event) => {
  const b = await readBody<{ html?: string; subject?: string; preheader?: string; targetLang?: string }>(event)
  const target = LANGS[String(b?.targetLang)]
  if (!target) throw createError({ statusCode: 400, statusMessage: 'Idioma no soportado' })
  const html = String(b?.html || '')
  if (!html || html.length > 200_000) throw createError({ statusCode: 400, statusMessage: 'HTML vacío o demasiado grande' })

  try {
    const out = await aiJson<{ html: string; subject: string; preheader: string }>({
      feature: 'translate',
      effort: 'medium',
      maxTokens: 64000,
      system: [
        `Eres traductor profesional de marketing. Traduce al ${target} con naturalidad (localiza expresiones, no traduzcas literal), manteniendo el tono y la intención persuasiva.`,
        'En el HTML solo cambias el texto visible y los atributos alt/title: NO toques etiquetas, estilos, href, src ni las variables {{...}} (sí puedes traducir el texto de fallback entre comillas en {{name | "..."}}).',
        brandBrief(),
      ].filter(Boolean).join('\n'),
      messages: [{ role: 'user', content: `ASUNTO: ${b?.subject ?? ''}\nPREHEADER: ${b?.preheader ?? ''}\n\nHTML:\n${html}` }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['html', 'subject', 'preheader'],
        properties: { html: { type: 'string' }, subject: { type: 'string' }, preheader: { type: 'string' } },
      },
    })
    if (skeleton(out.html) !== skeleton(html) || tags(out.html) !== tags(html)) {
      throw createError({ statusCode: 502, statusMessage: 'La traducción alteró la estructura o los enlaces del email; no se aplicó. Inténtalo de nuevo.' })
    }
    return out
  } catch (err: any) {
    if (err?.statusCode) throw err
    aiHttpError(err)
  }
})
