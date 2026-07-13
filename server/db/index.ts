import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve, join, dirname } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import * as schema from './schema'

const dataDir = resolve(process.cwd(), 'data')
const dbPath = join(dataDir, 'turbomailer.db')

// Ensure data directory exists
try {
  mkdirSync(dataDir, { recursive: true })
} catch (err) {
  console.error('Failed to create data directory:', err)
}

console.log(`[DB] Opening database at: ${dbPath}`)
const sqlite = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('cache_size = -64000')
sqlite.pragma('temp_store = MEMORY')
sqlite.pragma('mmap_size = 134217728')
sqlite.pragma('wal_autocheckpoint = 1000')

export const db = drizzle(sqlite, { schema })

export { sqlite }

// Stamp migrations whose objects already exist in the DB (created out-of-band,
// e.g. via drizzle-kit push or a copied DB file) so the migrator skips them
// instead of failing with "already exists". `when` must match the entry in
// migrations/meta/_journal.json. Add a marker here if a new migration ever
// fails on a legacy production DB.
function baselineOutOfBandMigrations() {
  const hasTable = (name: string) => !!sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name)
  const hasColumn = (table: string, column: string) =>
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
      .some(c => c.name === column)

  if (!hasTable('__drizzle_migrations')) return // fresh DB — migrator handles it

  const markers = [
    { when: 1778274896733, applied: () => hasTable('refresh_tokens') },        // 0007
    { when: 1783205018862, applied: () => hasColumn('campaigns', 'tag_filter') }, // 0008
  ]

  const { m } = sqlite
    .prepare(`SELECT max(created_at) AS m FROM __drizzle_migrations`)
    .get() as { m: number | null }

  for (const marker of markers) {
    if ((m ?? 0) < marker.when && marker.applied()) {
      sqlite.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`)
        .run(`baseline-${marker.when}`, marker.when)
      console.log(`[DB] Baselined out-of-band migration ${marker.when}`)
    }
  }
}

// Auto-run migrations on startup
function runMigrations() {
  try {
    let migrationsPath = resolve(process.cwd(), 'server/db/migrations')
    
    if (!import.meta.dev) {
      // dirname(process.argv[1]) = .output/server regardless of cwd
      const entryDir = process.argv[1] ? dirname(process.argv[1]) : null
      const prodPaths = [
        ...(entryDir ? [join(entryDir, 'assets/migrations')] : []),
        resolve(process.cwd(), '.output/server/assets/migrations'),
        resolve(process.cwd(), 'server/assets/migrations'),
        resolve(process.cwd(), 'server/db/migrations'),
      ]

      migrationsPath = prodPaths.find(p => existsSync(p)) ?? prodPaths[0]
    }

    console.log(`[DB] Checking migrations in: ${migrationsPath}`)

    if (!existsSync(migrationsPath)) {
      throw new Error(`Migrations folder not found at ${migrationsPath}`)
    }

    baselineOutOfBandMigrations()
    migrate(db, { migrationsFolder: migrationsPath })
    console.log('[DB] Database migrations completed successfully.')
  } catch (error) {
    console.error('[DB] Failed to run database migrations:', error)
    if (!import.meta.dev) {
      // Fail loudly: an unmigrated schema causes opaque 500s on every write.
      throw error
    }
  }
}

// Run migrations synchronously on startup
runMigrations()

// Recover campaigns stuck in 'sending' after a crash/restart.
// A/B campaigns in the 'waiting' phase are NOT stuck — they idle in 'sending'
// on purpose until the scheduler decides the winning variant.
try {
  sqlite.prepare(
    `UPDATE campaigns SET status = 'paused', finished_at = ?
     WHERE status = 'sending' AND (ab_phase IS NULL OR ab_phase != 'waiting')`
  ).run(Math.floor(Date.now() / 1000))
  console.log('[DB] Recovered any stuck campaigns.')
} catch {
  // Non-fatal — campaigns table may not exist yet on first run
}

export default db
