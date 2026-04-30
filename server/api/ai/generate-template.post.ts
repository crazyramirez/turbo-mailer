import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { messages } = body

  if (!messages || !Array.isArray(messages)) {
    throw createError({ statusCode: 400, statusMessage: 'Messages array is required' })
  }

  const config = useRuntimeConfig()
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY
  const model = config.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini'

  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'OpenAI API Key not configured' })
  }

  const systemPrompt = `Eres un asistente experto en diseño y copywriting de campañas de email marketing de ALTA GAMA (Premium).
El usuario quiere generar una plantilla de email completa.
Tu objetivo es recabar un poco de información (máximo 2 preguntas en total en la conversación) sobre la empresa, objetivo de la campaña o público objetivo, pero SIN ser agotador.

Si consideras que tienes suficiente información (o si el usuario ya te ha dado un contexto claro), debes GENERAR la plantilla COMPLETA con TODOS LOS TEXTOS E IMÁGENES ADAPTADOS AL CONTEXTO. No uses textos genéricos. Escribe copy persuasivo y profesional.
Si te falta información clave, haz UNA pregunta clara.

DEBES RESPONDER SIEMPRE EN FORMATO JSON VÁLIDO. 
Formato si haces una pregunta:
{
  "type": "question",
  "text": "Tu pregunta aquí..."
}

Formato si generas la plantilla:
{
  "type": "template",
  "styleId": "uno de estos: default, viseni, corporate, tech-noir, dark-gold, midnight-gold",
  "blocks": [
    { 
      "id": "header-pro",
      "replacements": {
        "title": "Texto principal persuasivo",
        "subtitle": "Subtítulo descriptivo",
        "badge": "Novedad",
        "image": "https://loremflickr.com/1200/800/business,premium"
      }
    },
    { "id": "text", "replacements": { "title": "Cuerpo del texto persuasivo usando <br> o <b>..." } },
    ...
  ]
}

Lista de bloques disponibles para usar (sus ids):
header-pro, text, button, image, card, grid-2, grid-3, grid-4, note, presence, unsubscribe, signature.

REGLAS DE REEMPLAZO (replacements):
- Las claves del objeto "replacements" corresponden al tipo de dato (title, subtitle, badge, button, image, logo, contact, ps).
- Para "image" o "logo", usa SIEMPRE URLs de https://image.pollinations.ai/prompt/{prompt_descriptivo_en_ingles}?width=800&height=600&nologo=true
- MUY IMPORTANTE: En la URL de pollinations.ai, el {prompt_descriptivo_en_ingles} debe ser un prompt detallado para generar una imagen por IA (ej. "luxury%20swiss%20watch%20professional%20photography"). REEMPLAZA LOS ESPACIOS POR "%20". NUNCA dejes espacios en blanco en la URL.
- Genera el COPY REAL, persuasivo, largo si es necesario, adaptado a la petición. No uses "Escribe aquí tu texto".

Elige los bloques que mejor se adapten y en orden lógico (ej. header -> text -> image -> card -> button -> signature).
Responde SOLO con el JSON válido.`

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
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    })

    const data = await response.json()
    if (data.error) {
      throw createError({ statusCode: 500, statusMessage: data.error.message })
    }

    const content = data.choices[0].message.content
    try {
      const result = JSON.parse(content)
      return result
    } catch (e) {
      return { type: 'question', text: 'Lo siento, no pude procesar la solicitud. ¿Podrías darme más detalles?' }
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Error calling OpenAI'
    })
  }
})
