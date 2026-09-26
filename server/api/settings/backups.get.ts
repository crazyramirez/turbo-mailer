import { listLocalBackups } from '~/server/utils/backup'
import { s3ConfigFrom, s3List } from '~/server/utils/s3'
import { jobsStatus } from '~/server/utils/jobs'

export default defineEventHandler(async () => {
  const config = useServerConfig()
  const s3 = s3ConfigFrom(config)
  let remote: { key: string; size: number; lastModified: string }[] | null = null
  let remoteError: string | null = null
  if (s3) {
    try {
      remote = (await s3List(s3, 'turbomailer/backup_')).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 30)
    } catch (err: any) {
      remoteError = String(err?.message || err).slice(0, 200)
    }
  }
  return {
    local: await listLocalBackups(),
    remote,
    remoteError,
    s3Configured: !!s3,
    job: jobsStatus().find(j => j.name === 'backup') ?? null,
  }
})
