import { extractBrandFromUrl } from '~/server/utils/ai/brand-kit'
import { aiHttpError, AiError } from '~/server/utils/ai/provider'

// Suggests a brand kit from the brand's website (not saved until the user confirms).
export default defineEventHandler(async (event) => {
  const { url } = await readBody<{ url?: string }>(event)
  if (!url || !/^https?:\/\//i.test(url)) throw createError({ statusCode: 400, statusMessage: 'URL no válida (debe empezar por http:// o https://)' })
  try {
    return await extractBrandFromUrl(url)
  } catch (err: any) {
    if (err?.statusCode) throw err
    if (err instanceof AiError) aiHttpError(err)
    throw createError({ statusCode: 422, statusMessage: `No se pudo analizar la web: ${String(err?.message || err).slice(0, 200)}` })
  }
})
