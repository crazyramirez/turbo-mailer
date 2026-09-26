import { runBlocklistCheck, latestBlocklistStatus } from '~/server/utils/blocklists'

export default defineEventHandler(async () => {
  await runBlocklistCheck(useServerConfig())
  return latestBlocklistStatus()
})
