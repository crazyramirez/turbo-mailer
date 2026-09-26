import { sanitizeBrandKit, saveBrandKit } from '~/server/utils/ai/brand-kit'
import { logAudit } from '~/server/utils/audit'
import { getClientIp } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const kit = saveBrandKit(sanitizeBrandKit(body))
  logAudit('brand_kit.update', { name: kit.name }, getClientIp(event))
  return kit
})
