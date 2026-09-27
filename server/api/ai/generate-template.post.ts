import { generateEditorAssistant } from '~/server/utils/ai/editor-assistant'
import { aiHttpError } from '~/server/utils/ai/provider'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 100_000) {
    throw createError({ statusCode: 400, statusMessage: 'La petición del asistente es demasiado grande o no es válida.' })
  }
  try {
    return await generateEditorAssistant(body)
  } catch (err) {
    aiHttpError(err)
  }
})
