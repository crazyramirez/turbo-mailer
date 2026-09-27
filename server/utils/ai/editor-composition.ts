import { editorStyleBases } from '~/utils/editorStyles'
import type { EditorAssistantBrief } from '~/utils/editorAssistant'

// These are readable-copy budgets, not truncation lengths. Oversized model
// responses are repaired so information can move into a text module instead.
export function editorCopyLimit(id: string, field: string): number {
  if (field === 'badge') return 90
  if (field === 'button') return 100 // Same maximum as the operator-approved CTA.
  if (field === 'features') return 160
  if (field === 'title') {
    if (id === 'text') return 12000
    if (id === 'metrics' || id === 'pricing') return 90
    if (id.startsWith('grid-')) return 110
    return 200
  }
  if (field === 'subtitle') {
    if (id.startsWith('grid-') || id === 'metrics' || id === 'pricing') return 650
    if (id === 'hero' || id === 'header-pro') return 600
    return 1800
  }
  return 12000
}

/** Give the model the actual visual system instead of only an opaque theme id. */
export function editorComposition(brief: EditorAssistantBrief, hasImages: boolean) {
  const theme = editorStyleBases.find(style => style.id === brief.styleId) ?? editorStyleBases[0]!
  const goal = brief.objective.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let sequence = 'Una apertura, contexto útil, beneficio concreto y siguiente paso.'
  if (/evento|webinar|taller|inscri|registr|event|workshop/.test(goal)) {
    sequence = 'Presenta el evento y su utilidad; desarrolla agenda, fecha y lugar solo si están confirmados; resuelve dudas y termina con la inscripción.'
  } else if (/reactiv|recuper|retenc|reconnect|return/.test(goal)) {
    sequence = 'Abre con un motivo real para retomar la relación; explica qué ha cambiado y ofrece un siguiente paso sencillo, sin inventar descuentos ni urgencia.'
  } else if (/inform|educ|newsletter|boletin|nutri|nurtur|learn/.test(goal)) {
    sequence = 'Abre con una idea editorial; desarrolla secciones con valor, alternando lectura y síntesis; termina con el siguiente recurso o conversación.'
  } else if (/vend|venta|compr|catalog|colecc|reserv|sell|shop|product/.test(goal)) {
    sequence = 'Presenta el beneficio principal; alterna contexto, selección de productos o beneficios en pares y una prueba real si existe; cierra con la acción de compra o consulta.'
  }
  return {
    sequence,
    visualSystem: {
      fontFamily: theme.config.fontFamily,
      labelFontFamily: theme.config.labelFontFamily || theme.config.fontFamily,
      background: theme.config.contentBg, headingColor: theme.config.titleColor,
      accentColor: theme.config.accentColor, cornerRadius: theme.config.cardRadius,
    },
    rhythm: hasImages
      ? 'Alterna una imagen protagonista con texto o pares de tarjetas. Cada imagen debe aportar contexto; evita repetir la misma foto como relleno.'
      : 'Construye el ritmo con una apertura tipográfica, lectura a ancho completo y síntesis en pares o nota. No encadenes tarjetas vacías de imágenes.',
    copyBudgets: {
      opening: { title: editorCopyLimit('hero', 'title'), subtitle: editorCopyLimit('hero', 'subtitle') },
      gridItem: { title: editorCopyLimit('grid-2', 'title'), subtitle: editorCopyLimit('grid-2', 'subtitle') },
      button: editorCopyLimit('button', 'button'),
    },
    rule: 'Los presupuestos son máximos de caracteres visibles por hueco, no objetivos de longitud. Si el contenido es largo, redistribúyelo en módulos text sin eliminar información. Adapta esta guía a la dirección visual y a las restricciones expresas del usuario.',
  }
}
