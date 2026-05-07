import { getImapConfig, processBounces } from '~/server/utils/bounce-processor'

export default defineEventHandler(async () => {
  const cfg = getImapConfig()
  if (!cfg) {
    throw createError({
      statusCode: 422,
      statusMessage: 'IMAP no configurado — configura host IMAP en config.json o usa auto-detección',
    })
  }
  return processBounces(cfg)
})
