import { resolveProvider, aiUsageThisMonth } from '~/server/utils/ai/provider'

// Which AI backend is active (for the UI to enable/disable AI features).
export default defineEventHandler(() => {
  const p = resolveProvider()
  return {
    configured: !!p,
    provider: p?.name ?? null,
    model: p?.model ?? null,
    usage: aiUsageThisMonth(),
  }
})
