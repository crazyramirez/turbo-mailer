import { generateCampaign, type CampaignBrief } from '~/server/utils/ai/campaign-gen'
import { AiError } from '~/server/utils/ai/provider'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

// Streams progress (Server-Sent Events) while the campaign is generated, then
// the final result: { type: 'progress', chars } … { type: 'result', data }.
export default defineEventHandler(async (event) => {
  const body = await readBody<CampaignBrief>(event)
  if (!body?.brief?.trim() || body.brief.length > 8000) {
    throw createError({ statusCode: 400, statusMessage: 'Describe la campaña (máx. 8000 caracteres)' })
  }
  const input: CampaignBrief = {
    brief: body.brief.trim(),
    goal: body.goal || 'sell',
    url: body.url?.trim() || undefined,
    listId: body.listId ? Number(body.listId) : null,
    language: String(body.language || 'es').slice(0, 5),
    tone: body.tone?.slice(0, 200),
    useBrandKit: body.useBrandKit !== false,
    aiImages: body.aiImages === true,
  }

  const stream = createEventStream(event)
  const send = (payload: Record<string, unknown>) => stream.push(JSON.stringify(payload)).catch(() => {})

  ;(async () => {
    try {
      await send({ type: 'stage', stage: input.url ? 'reading_url' : 'thinking' })
      let lastSent = 0
      const result = await generateCampaign(input, (chars) => {
        if (chars - lastSent > 200) {
          lastSent = chars
          void send({ type: 'progress', chars })
        }
      })
      logAudit('ai.campaign_generated', { goal: input.goal, blocks: result.campaign.blocks.length }, getClientIp(event))
      await send({ type: 'result', data: result })
    } catch (err: any) {
      const message = err instanceof AiError ? err.message : err?.statusMessage || err?.message || 'Error generando la campaña'
      await send({ type: 'error', message })
    } finally {
      await stream.close()
    }
  })()

  return stream.send()
})
