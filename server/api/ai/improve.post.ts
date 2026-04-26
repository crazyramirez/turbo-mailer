import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { text } = body

  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Text is required' })
  }

  if (typeof text !== 'string' || text.length > 100_000) {
    throw createError({ statusCode: 400, statusMessage: 'Text too large (max 100KB)' })
  }

  const config = useRuntimeConfig()
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY
  const model = config.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini'

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OpenAI API Key not configured'
    })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en copywriting para email marketing. Tu tarea es mejorar los textos de un fragmento HTML para hacerlos más profesionales, persuasivos y atractivos. IMPORTANTE: Debes devolver el MISMO código HTML que recibas. Solo puedes modificar el contenido de texto dentro de las etiquetas. NO elimines, modifiques ni añadas etiquetas HTML (como <img>, <div>, <span>, etc.) ni sus atributos (style, class, src, etc.). Mantén las variables tipo {{ Nombre }} o {{ Empresa }} intactas. No añadas introducciones ni explicaciones, solo devuelve el HTML final.'
          },
          {
            role: 'user',
            content: `Mejora los textos de este HTML: ${text}`
          }
        ],
        temperature: 0.7
      })
    })

    const data = await response.json()
    if (data.error) {
      throw createError({
        statusCode: 500,
        statusMessage: data.error.message
      })
    }

    const improvedText = data.choices[0].message.content
      .replace(/```html|```/gi, '')
      .replace(/^"|"$/g, '')
      .trim()
    return { improvedText }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Error calling OpenAI'
    })
  }
})
