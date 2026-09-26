import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve, join, dirname } from 'node:path'
import { mkdirSync, existsSync, renameSync, copyFileSync, unlinkSync } from 'node:fs'
import * as schema from './schema'
import { dataDir } from '../utils/data-dir'

const dbPath = process.env.TM_DB_PATH || join(dataDir, 'turbomailer.db')

// Ensure data directory exists
try {
  mkdirSync(dirname(dbPath), { recursive: true })
} catch (err) {
  console.error('Failed to create data directory:', err)
}

// Staged restore: the settings screen uploads a backup to restore-pending.db;
// it is swapped in here, before the connection opens, on the next start.
// The current DB is kept as pre-restore-<ts>.db so a bad restore is undoable.
function applyPendingRestore() {
  const pending = join(dirname(dbPath), 'restore-pending.db')
  if (!existsSync(pending)) return
  try {
    if (existsSync(dbPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      copyFileSync(dbPath, join(dirname(dbPath), `pre-restore-${ts}.db`))
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix)
      }
    }
    renameSync(pending, dbPath)
    console.log('[DB] Restored database from restore-pending.db')
  } catch (err) {
    console.error('[DB] Pending restore failed — keeping current database:', err)
  }
}
applyPendingRestore()

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

export { sqlite, dbPath }

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

function resolveMigrationsPath(): string {
  // Tests and tooling point here explicitly — never at a stale .output build
  if (process.env.TM_MIGRATIONS_DIR) return resolve(process.env.TM_MIGRATIONS_DIR)
  if (import.meta.dev) return resolve(process.cwd(), 'server/db/migrations')
  // dirname(process.argv[1]) = .output/server regardless of cwd
  const entryDir = process.argv[1] ? dirname(process.argv[1]) : null
  const prodPaths = [
    ...(entryDir ? [join(entryDir, 'assets/migrations')] : []),
    resolve(process.cwd(), '.output/server/assets/migrations'),
    resolve(process.cwd(), 'server/assets/migrations'),
    resolve(process.cwd(), 'server/db/migrations'),
  ]
  return prodPaths.find(p => existsSync(p)) ?? prodPaths[0]
}

// Auto-run migrations on startup
function runMigrations() {
  try {
    const migrationsPath = resolveMigrationsPath()
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

// Crash recovery.
//
// 1. A send left in 'sending' was mid-SMTP-transaction when the process died:
//    the server may or may not have accepted it. Re-sending risks a duplicate
//    in the recipient's inbox, so it is closed as failed (at-most-once) with
//    an explicit reason — "Reintentar fallidos" can still resend it by hand.
// 2. Campaigns left in 'sending' are resumed automatically by the scheduler
//    right after boot (see server/plugins/scheduler.ts) instead of being
//    parked as 'paused' — a deploy or reboot no longer strands a campaign.
try {
  const interrupted = sqlite.prepare(
    `UPDATE sends SET status = 'failed', bounce_class = 'soft',
       error_msg = 'Interrumpido por un reinicio del servidor durante el envío — no se reenvía automáticamente para evitar duplicados'
     WHERE status = 'sending'`,
  ).run()
  if (interrupted.changes > 0) {
    console.log(`[DB] Closed ${interrupted.changes} send(s) interrupted mid-transaction.`)
  }
} catch {
  // Non-fatal — sends table may not exist yet on first run
}

export default db
