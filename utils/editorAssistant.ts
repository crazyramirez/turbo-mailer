import type { PlannedBlock, BrandLite } from './emailAssembler'

export interface AssistantSignature {
  name: string
  details: string
  email: string
  website: string
  phone: string
  imageUrl: string
  ps: string
}

export interface AssistantSignatureCandidate {
  id: string
  sourceType: 'campaign' | 'template' | 'settings'
  sourceName: string
  updatedAt: number
  signature: AssistantSignature
}

export interface EditorAssistantContext {
  brandConfigured: boolean
  brand: BrandLite & { audience?: string; voice?: string; language?: string; tagline?: string }
  signatures: AssistantSignatureCandidate[]
  recentCampaigns: { id: number; name: string; subject: string }[]
}

export interface EditorAssistantBrief {
  campaign: string
  objective: string
  audience: string
  offer: string
  ctaText: string
  ctaUrl: string
  tone: string
  styleId: string
  visualDirection: string
  language: string
  constraints: string
  useBrandKit: boolean
  includeSignature: boolean
  signature: AssistantSignature | null
}

export interface EditorAssistantDraft {
  type: 'template'
  text: string
  name: string
  subject: string
  preheader: string
  styleId: string
  blocks: PlannedBlock[]
  warnings: string[]
  rationale: string
  campaign?: AssistantCampaignMetadata
}

export interface AssistantCampaignOptions {
  listId: number | null
  /** Source material, independent of the approved main call to action. */
  url: string
  aiImages: boolean
}

export interface AssistantCampaignMetadata {
  subjectB: string
  followUpSubject: string
  sendTime: {
    weekday: 'any' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
    hour: number
    reason: string
  }
}

export interface EditorAssistantRequest {
  brief: EditorAssistantBrief
  instruction?: string
  previous?: EditorAssistantDraft
  campaignOptions?: AssistantCampaignOptions
}

export function emptyAssistantSignature(): AssistantSignature {
  return { name: '', details: '', email: '', website: '', phone: '', imageUrl: '', ps: '' }
}

export function emptyAssistantBrief(): EditorAssistantBrief {
  return {
    campaign: '', objective: '', audience: '', offer: '', ctaText: '', ctaUrl: '',
    tone: 'Claro, cercano y profesional', styleId: 'default', visualDirection: '',
    language: 'es', constraints: '', useBrandKit: true, includeSignature: true, signature: null,
  }
}
