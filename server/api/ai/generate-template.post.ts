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
El usuario quiere generar una plantilla de email completa y profesional.

TU MISIÓN:
1. Analizar la petición del usuario.
2. Si la petición es vaga, haz una o dos preguntas clave para entender el sector, público y objetivo.
3. Si tienes contexto, genera una estructura de bloques JSON persuasiva y visualmente impactante.

ESTILOS DISPONIBLES (Elige el más adecuado según el tono):
- "default": Limpio, minimalista, mucho espacio en blanco. Ideal para newsletters generales.
- "viseni": Vanguardista, artístico, tipografía elegante. Ideal para moda, diseño o marcas de autor.
- "corporate": Azul profundo y gris, serio, robusto. Ideal para B2B, banca o consultoría.
- "tech-noir": Oscuro con neones (índigo/cian), futurista. Ideal para software, SaaS o gaming.
- "dark-gold": Fondo oscuro (slate-900) con acentos dorados. Lujo y exclusividad.
- "midnight-gold": Negro puro con degradados dorados y tipografía "Outfit". El nivel máximo de exclusividad.

BLOQUES DISPONIBLES (ids):
header-pro, text, button, image, card, grid-2, grid-3, grid-4, note, presence, unsubscribe, signature.

REGLAS DE GENERACIÓN DE CONTENIDO:
- "replacements": Claves permitidas: title, subtitle, badge, button, image, logo, contact, ps.
- IMÁGENES: Usa SIEMPRE https://image.pollinations.ai/prompt/{prompt_descriptivo_en_ingles}?width=1200&height=800&nologo=true
- El prompt de la imagen debe ser en INGLÉS, detallado y evocar "High-end photography, cinematic lighting, professional". 
- REEMPLAZA ESPACIOS POR %20. NUNCA uses espacios.
- TEXTOS: Escribe copy real y largo. Usa <br> para saltos de línea y <b> para resaltar palabras clave. NADA de placeholders.
- GRIDS (grid-2, grid-3, grid-4): Los replacements pueden ser ARRAYS si hay varios elementos (ej. "title": ["Opción A", "Opción B"]). Si pasas un solo string, se repetirá en todos.
- FIRMA (signature): Genera obligatoriamente "title" (Nombre), "subtitle" (Empresa/Cargo), y "contact" (como un ARRAY de exactamente 2 strings: ["correo@ejemplo.com", "Sitio Web o Teléfono"]).

DEBES RESPONDER SIEMPRE EN FORMATO JSON VÁLIDO. 

Formato Pregunta:
{ "type": "question", "text": "Tu pregunta aquí..." }

Formato Plantilla:
{
  "type": "template",
  "styleId": "estilo_elegido",
  "blocks": [
    { "id": "header-pro", "replacements": { "title": "...", "subtitle": "...", "badge": "...", "image": "..." } },
    { "id": "text", "replacements": { "title": "Texto largo con <b>negritas</b>..." } },
    ...
  ]
}

Responde SOLO con el JSON.`

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
