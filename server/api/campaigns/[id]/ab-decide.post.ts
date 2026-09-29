import { AbDecideError, decideAbTest, type AbChoice } from '~/server/utils/ab-decide'
import { getClientIp } from '~/server/utils/auth'

// Ends the A/B subject test now instead of waiting for abDecideAt:
//   { winner: 'A' | 'B' }  send the rest with that subject
//   { winner: 'auto' }     decide on the data collected so far
// While the sample is still going out only 'A' is accepted (see ab-decide.ts).

const CHOICES = new Set<AbChoice>(['A', 'B', 'auto'])

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ winner?: string }>(event).catch(() => null)
  const choice = String(body?.winner ?? '') as AbChoice
  if (!CHOICES.has(choice)) throw createError({ statusCode: 400, statusMessage: 'winner debe ser A, B o auto' })

  try {
    const decision = decideAbTest(campaignId, choice, 'user', getClientIp(event))
    if (!decision) throw createError({ statusCode: 409, statusMessage: 'El test A/B ya se decidió' })
    return decision
  } catch (err) {
    if (err instanceof AbDecideError) {
      throw createError({ statusCode: err.code === 'not_found' ? 404 : 409, statusMessage: err.message })
    }
    throw err
  }
})
