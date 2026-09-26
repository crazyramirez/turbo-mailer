import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { aiJson, aiHttpError } from '~/server/utils/ai/provider'
import { resolveUpload } from '~/server/utils/uploads'
import { safeFetch } from '~/server/utils/safe-fetch'

// Describes an image for its alt attribute (accessibility + image-blocked
// inboxes show it instead of the picture).
export default defineEventHandler(async (event) => {
  const { url, language, context } = await readBody<{ url?: string; language?: string; context?: string }>(event)
  if (!url) throw createError({ statusCode: 400, statusMessage: 'url is required' })

  let buf: Buffer
  try {
    const local = url.match(/\/uploads\/([^/?#]+)/)?.[1]
    const file = local ? resolveUpload(decodeURIComponent(local)) : null
    if (file) buf = readFileSync(file)
    else if (/^https?:\/\//i.test(url)) buf = (await safeFetch(url, { maxBytes: 10 * 1024 * 1024, accept: 'image/*' })).body
    else throw new Error('URL no soportada')
    // Downscale: plenty for a description, far fewer tokens
    buf = await sharp(buf).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  } catch (err: any) {
    throw createError({ statusCode: 422, statusMessage: `No se pudo leer la imagen: ${String(err?.message || err).slice(0, 120)}` })
  }

  try {
    const out = await aiJson<{ alt: string; decorative: boolean }>({
      feature: 'alt_text',
      effort: 'low',
      maxTokens: 1000,
      system: 'Escribes textos alternativos (alt) para imágenes de emails: concisos (≤ 120 caracteres), describen lo que aporta la imagen al mensaje, sin empezar por "imagen de". Si es puramente decorativa, decorative=true y alt vacío.',
      messages: [{
        role: 'user',
        content: `Idioma: ${language || 'es'}.${context ? ` Contexto del email: ${String(context).slice(0, 500)}` : ''}`,
        images: [{ mediaType: 'image/jpeg', base64: buf.toString('base64') }],
      }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['alt', 'decorative'],
        properties: { alt: { type: 'string' }, decorative: { type: 'boolean' } },
      },
    })
    return { alt: out.decorative ? '' : out.alt.slice(0, 200), decorative: out.decorative }
  } catch (err) {
    aiHttpError(err)
  }
})
