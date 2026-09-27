<script setup lang="ts">
import CampaignAssistant from '~/components/campaigns/CampaignAssistant.vue'
import type { EditorAssistantDraft } from '~/utils/editorAssistant'
import { aiCampaignPayload } from '~/utils/aiCampaignDraft'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const { showToast } = useDashboardState()
let createdId: number | null = null
let templateName = ''

async function createCampaign(draft: EditorAssistantDraft, html: string, options: { listId: number | null; scheduledAt: string | null }) {
  // Keep a stable name for a retry, and persist the complete campaign in one write.
  if (!templateName) templateName = `IA_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
  if (!createdId) {
    const body = aiCampaignPayload(draft, html, templateName, options)
    await $fetch('/api/templates', { method: 'POST', body: { name: templateName, content: html } })
    const created = await $fetch<{ id: number }>('/api/campaigns', { method: 'POST', body })
    createdId = created.id
  }
  await router.push(`/campaigns/${createdId}`)
}
</script>

<template>
  <CampaignAssistant open campaign :apply="createCampaign" @close="emit('close')" @notify="showToast" />
</template>
