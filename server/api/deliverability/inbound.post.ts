import { getImapConfig, processBounces } from '~/server/utils/bounce-processor'

// Manual run of the inbound mailbox processor (bounces, complaints, DMARC).
export default defineEventHandler(async () => {
  const cfg = getImapConfig()
  if (!cfg) throw createError({ statusCode: 422, statusMessage: 'IMAP no configurado' })
  return processBounces(cfg)
})
