import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { brandBrief } from '~/server/utils/ai/brand-kit'

// Rewrites the copy of an HTML fragment keeping its markup intact. The result
// is checked: if the model touched tags or merge tags, it is rejected.

// Inline emphasis (b/strong/i/em/u/br) may legitimately change; structure may not
function tagSkeleton(html: string): string {
  return (html.match(/<\/?[a-z][a-z0-9-]*/gi) ?? [])
    .map(t => t.toLowerCase())
    .filter(t => !/^<\/?(b|strong|i|em|u|br)$/.test(t))
    .join('|')
}
function mergeTags(html: string): string[] {
  return (html.match(/\{\{[^}]+\}\}/g) ?? []).map(t => t.replace(/\s+/g, '')).sort()
}

export default defineEventHandler(async (event) => {
  const { text, context } = await readBody(event) ?? {}
  if (!text) throw createError({ statusCode: 400, statusMessage: 'Text is required' })
  if (typeof text !== 'string' || text.length > 100_000) {
    throw createError({ statusCode: 400, statusMessage: 'Text too large (max 100KB)' })
  }

  const brand = brandBrief()
  try {
    const out = await aiJson<{ improvedHtml: string }>({
      feature: 'editor_improve',
      system: [
        'Eres copywriter experto en email marketing. Mejoras los textos de un fragmento HTML para hacerlos más claros, persuasivos y profesionales, sin exagerar ni usar expresiones típicas de spam.',
        'Devuelve el MISMO HTML: solo cambia el texto visible. No añadas, quites ni modifiques etiquetas ni atributos (style, class, src, href...). Mantén intactas las variables {{...}}.',
        'Conserva el idioma original.',
        brand ? `IDENTIDAD DE MARCA:\n${brand}` : '',
      ].filter(Boolean).join('\n'),
      messages: [{ role: 'user', content: `HTML a mejorar:\n${text}${context ? `\n\nIndicaciones del usuario: ${String(context).slice(0, 2000)}` : ''}` }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['improvedHtml'],
        properties: { improvedHtml: { type: 'string' } },
      },
      effort: 'medium',
      maxTokens: 32000,
    })
    const improved = out.improvedHtml.trim()
    if (tagSkeleton(improved) !== tagSkeleton(text) || mergeTags(improved).join() !== mergeTags(text).join()) {
      throw createError({ statusCode: 502, statusMessage: 'La IA alteró la estructura del bloque; no se aplicó el cambio. Inténtalo de nuevo.' })
    }
    return { improvedText: improved }
  } catch (err: any) {
    if (err?.statusCode) throw err
    aiHttpError(err)
  }
})
