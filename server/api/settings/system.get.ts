import { statSync } from 'node:fs'
import { sqlite, dbPath } from '~/server/db/index'
import { jobsStatus } from '~/server/utils/jobs'
import { activeRunIds } from '~/server/utils/send-engine'
import { dataDir } from '~/server/utils/data-dir'
import { APP_VERSION } from '~/utils/version'

function fileSize(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

export default defineEventHandler(() => {
  const count = (sql: string) => (sqlite.prepare(sql).get() as { n: number }).n
  const migrations = (() => {
    try {
      return count('SELECT COUNT(*) AS n FROM __drizzle_migrations')
    } catch {
      return null
    }
  })()
  return {
    version: APP_VERSION,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    uptimeSec: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    dataDir,
    db: {
      path: dbPath,
      sizeBytes: fileSize(dbPath) + fileSize(`${dbPath}-wal`),
      migrations,
      journal: (sqlite.pragma('journal_mode', { simple: true }) as string) ?? null,
    },
    counts: {
      contacts: count('SELECT COUNT(*) AS n FROM contacts'),
      campaigns: count('SELECT COUNT(*) AS n FROM campaigns'),
      sends: count('SELECT COUNT(*) AS n FROM sends'),
      events: count('SELECT COUNT(*) AS n FROM tracking_events'),
      suppressions: count('SELECT COUNT(*) AS n FROM suppressions'),
    },
    activeCampaigns: activeRunIds(),
    jobs: jobsStatus(),
  }
})
