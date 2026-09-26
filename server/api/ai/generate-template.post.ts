import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { brandBrief } from '~/server/utils/ai/brand-kit'
import { STYLE_IDS } from '~/server/utils/ai/campaign-gen'

// Editor chat: asks a clarifying question or returns a block layout that the
// editor assembles (same contract as before, now provider-agnostic and
// schema-validated).

const BLOCK_IDS = ['header-pro', 'hero', 'text', 'button', 'image', 'card', 'grid-2', 'grid-3', 'grid-4', 'note', 'presence', 'testimonials', 'faq', 'metrics', 'product', 'coupon', 'unsubscribe', 'signature']
const strings = { type: 'array', items: { type: 'string' } }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'text', 'styleId', 'blocks'],
  properties: {
    type: { type: 'string', enum: ['question', 'template'] },
    text: { type: 'string' },
    styleId: { type: 'string', enum: STYLE_IDS },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'replacements'],
        properties: {
          id: { type: 'string', enum: BLOCK_IDS },
          replacements: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'subtitle', 'badge', 'button', 'image', 'logo', 'contact', 'ps'],
            properties: {
              title: strings, subtitle: strings, badge: strings, button: strings,
              image: strings, logo: strings, contact: strings, ps: strings,
            },
          },
        },
      },
    },
  },
}

const SYSTEM = `Eres un asistente experto en diseño y copywriting de campañas de email marketing de ALTA GAMA.
El usuario quiere generar una plantilla de email completa y profesional.

1. Si la petición es vaga, devuelve type="question" con UNA pregunta clave en "text" (blocks vacío).
2. Si tienes contexto suficiente, devuelve type="template" con una estructura de bloques persuasiva.

ESTILOS (styleId): default (limpio), viseni (artístico, moda/diseño), corporate (B2B serio), tech-noir (oscuro con neones, SaaS), dark-gold (lujo), midnight-gold (exclusividad máxima).

BLOQUES: header-pro, hero, text, button, image, card, grid-2, grid-3, grid-4, note, presence, testimonials, faq, metrics, product, coupon, signature, unsubscribe (siempre el último).

CAMPOS (replacements, arrays de strings — un elemento por hueco del bloque, [] si no aplica):
- title/subtitle/badge/button/ps: copy real y largo, nada de placeholders. En "text" el title es el cuerpo y admite <br> y <b>.
- image/logo: URLs https://image.pollinations.ai/prompt/{prompt_en_ingles_con_%20}?width=1200&height=800&nologo=true (fotografía profesional, iluminación cinematográfica).
- contact (firma): 2 strings, cada uno UN dato (un email, una web o un teléfono).
Personaliza con {{name | "fallback"}} solo donde suene natural. Sin MAYÚSCULAS gritadas ni "!!!".`

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { messages } = body ?? {}
  if (!Array.isArray(messages) || !messages.length) {
    throw createError({ statusCode: 400, statusMessage: 'Messages array is required' })
  }
  // The chat UI opens with an assistant greeting; the model's history must start with the user
  const history = messages
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 8000) }))
  while (history.length && history[0].role === 'assistant') history.shift()
  if (!history.length) throw createError({ statusCode: 400, statusMessage: 'Messages array is required' })

  const brand = brandBrief()
  try {
    const result = await aiJson<{ type: 'question' | 'template'; text: string; styleId: string; blocks: { id: string; replacements: Record<string, string[]> }[] }>({
      feature: 'editor_template',
      system: brand ? `${SYSTEM}\n\nIDENTIDAD DE MARCA (respétala):\n${brand}` : SYSTEM,
      messages: history,
      schema: SCHEMA,
      effort: 'medium',
      maxTokens: 16000,
    })
    // Drop empty replacement keys so the editor keeps block defaults
    for (const b of result.blocks) {
      for (const [k, v] of Object.entries(b.replacements)) {
        if (!v.length || v.every(x => !x.trim())) delete b.replacements[k]
      }
    }
    return result
  } catch (err) {
    aiHttpError(err)
  }
})
