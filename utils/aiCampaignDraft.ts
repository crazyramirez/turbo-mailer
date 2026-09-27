import type { EditorAssistantDraft } from './editorAssistant'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** The suggestion is in the operator's local timezone, at least 15 minutes ahead. */
export function nextCampaignSendDate(
  suggestion?: { weekday: string; hour: number } | null,
  now = new Date(),
): Date | null {
  if (!suggestion || !Number.isInteger(suggestion.hour) || suggestion.hour < 0 || suggestion.hour > 23) return null
  const weekday = WEEKDAYS.indexOf(suggestion.weekday)
  if (suggestion.weekday !== 'any' && weekday === -1) return null
  const date = new Date(now)
  date.setHours(suggestion.hour, 0, 0, 0)
  if (suggestion.weekday !== 'any') date.setDate(date.getDate() + (weekday - date.getDay() + 7) % 7)
  if (date.getTime() <= now.getTime() + 15 * 60_000) date.setDate(date.getDate() + (suggestion.weekday === 'any' ? 1 : 7))
  return date
}

export function aiCampaignPayload(
  draft: EditorAssistantDraft,
  html: string,
  templateName: string,
  options: { listId: number | null; scheduledAt: string | null },
) {
  if (!html.trim()) throw new Error('La propuesta no tiene contenido.')
  if (options.scheduledAt && (!options.listId || !Number.isFinite(Date.parse(options.scheduledAt)))) {
    throw new Error('Elige una lista y una fecha válida para programar la campaña.')
  }
  return {
    name: draft.name,
    subject: draft.subject,
    preheader: draft.preheader,
    subjectB: draft.campaign?.subjectB || '',
    followUpSubject: draft.campaign?.followUpSubject || '',
    templateName,
    templateHtml: html,
    listId: options.listId,
    status: options.scheduledAt ? 'scheduled' : 'draft',
    scheduledAt: options.scheduledAt,
  }
}
