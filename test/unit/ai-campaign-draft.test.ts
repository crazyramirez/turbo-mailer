import { describe, expect, it } from 'vitest'
import { aiCampaignPayload, nextCampaignSendDate } from '~/utils/aiCampaignDraft'
import type { EditorAssistantDraft } from '~/utils/editorAssistant'

describe('AI campaign scheduling', () => {
  const monday = new Date(2026, 8, 28, 10, 50)

  it('keeps the suggested local hour and skips a same-day suggestion less than 15 minutes away', () => {
    const nextMonday = nextCampaignSendDate({ weekday: 'monday', hour: 11 }, monday)!
    expect(nextMonday.getDate()).toBe(5)
    expect(nextMonday.getMonth()).toBe(9)
    expect(nextMonday.getDay()).toBe(1)
    expect(nextMonday.getHours()).toBe(11)
    expect(nextMonday.getMinutes()).toBe(0)
  })

  it('uses today when the recommendation is still ahead, and tomorrow for any-day recommendations already passed', () => {
    expect(nextCampaignSendDate({ weekday: 'monday', hour: 12 }, monday)).toEqual(new Date(2026, 8, 28, 12))
    expect(nextCampaignSendDate({ weekday: 'any', hour: 10 }, monday)).toEqual(new Date(2026, 8, 29, 10))
    expect(nextCampaignSendDate({ weekday: 'friday', hour: 9 }, monday)).toEqual(new Date(2026, 9, 2, 9))
  })

  it.each([undefined, null, { weekday: 'oops', hour: 10 }, { weekday: 'any', hour: 24 }, { weekday: 'any', hour: -1 }, { weekday: 'any', hour: 10.5 }])('ignores unusable suggestions (%j)', suggestion => {
    expect(nextCampaignSendDate(suggestion, monday)).toBeNull()
  })
})

describe('complete AI campaign persistence', () => {
  const draft: EditorAssistantDraft = {
    type: 'template', name: 'Colección', subject: 'Descubre la colección', preheader: 'Piezas elegidas para ti',
    text: '', styleId: 'corporate', blocks: [], warnings: [], rationale: '',
    campaign: { subjectB: 'Tu próximo favorito', followUpSubject: 'No te pierdas la colección', sendTime: { weekday: 'monday', hour: 10, reason: 'Audiencia profesional' } },
  }

  it('persists the reviewed HTML and every campaign field together as a draft', () => {
    expect(aiCampaignPayload(draft, '<html>Propuesta revisada</html>', 'IA_123', { listId: 3, scheduledAt: null })).toEqual({
      name: draft.name, subject: draft.subject, preheader: draft.preheader,
      subjectB: draft.campaign!.subjectB, followUpSubject: draft.campaign!.followUpSubject,
      templateHtml: '<html>Propuesta revisada</html>', templateName: 'IA_123', listId: 3, status: 'draft', scheduledAt: null,
    })
  })

  it('schedules only when the operator selected scheduling and a list', () => {
    const scheduledAt = new Date(2026, 9, 5, 10).toISOString()
    expect(aiCampaignPayload(draft, '<html>Email</html>', 'IA_123', { listId: 3, scheduledAt })).toMatchObject({ status: 'scheduled', scheduledAt })
    expect(() => aiCampaignPayload(draft, '<html>Email</html>', 'IA_123', { listId: null, scheduledAt })).toThrow(/lista/)
    expect(() => aiCampaignPayload(draft, '<html>Email</html>', 'IA_123', { listId: 3, scheduledAt: 'invalid' })).toThrow(/fecha/)
  })

  it('does not create an empty campaign when assembly produced no HTML', () => {
    expect(() => aiCampaignPayload(draft, ' ', 'IA_123', { listId: null, scheduledAt: null })).toThrow(/contenido/)
  })
})
