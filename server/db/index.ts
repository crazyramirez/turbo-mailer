import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve, join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import * as schema from './schema'

const dataDir = resolve(process.cwd(), 'data')
const dbPath = join(dataDir, 'turbomailer.db')

// Try to find migrations in different possible locations
let migrationsPath = resolve(process.cwd(), 'server/db/migrations')
if (!import.meta.dev) {
  // In production, they might be in the .output directory
  const prodPath = resolve(process.cwd(), '.output/server/assets/migrations')
  const alternativeProdPath = resolve(process.cwd(), 'server/assets/migrations')
  
  if (existsSync(prodPath)) {
    migrationsPath = prodPath
  } else if (existsSync(alternativeProdPath)) {
    migrationsPath = alternativeProdPath
  }
}

// Ensure data directory exists
try {
  mkdirSync(dataDir, { recursive: true })
} catch (err) {
  console.error('Failed to create data directory:', err)
}

const sqlite = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Ensure runtime tables exist regardless of migration state
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY NOT NULL,
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    first_attempt INTEGER NOT NULL,
    blocked_until INTEGER
  )
`)


export { sqlite }

// Auto-run migrations on startup
// NOTE: sessions table also ensured above via CREATE TABLE IF NOT EXISTS
try {
  console.log('Checking database migrations...')
  
  // Check if we have tables but no migration table (transition from manual)
  const hasTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'").get()
  const hasMigrationTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get()
  
  if (hasTables && !hasMigrationTable) {
    console.log('Legacy database detected. Skipping initial migration to avoid conflicts.')
    // We manually ensure settings exists in legacy databases
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT,
        updated_at INTEGER
      )
    `)
  } else {
    migrate(db, { migrationsFolder: migrationsPath })
    console.log('Database migrations completed successfully.')
  }
} catch (error) {
  console.error('Failed to run database migrations:', error)
}

// Apply incremental schema changes that may not be covered by migrations (legacy DBs)
try {
  const campaignCols = (sqlite.prepare('PRAGMA table_info(campaigns)').all() as any[]).map((c: any) => c.name)
  const contactCols = (sqlite.prepare('PRAGMA table_info(contacts)').all() as any[]).map((c: any) => c.name)

  if (!campaignCols.includes('unsub_email_subject')) sqlite.exec(`ALTER TABLE campaigns ADD COLUMN unsub_email_subject TEXT`)
  if (!campaignCols.includes('unsub_email_message')) sqlite.exec(`ALTER TABLE campaigns ADD COLUMN unsub_email_message TEXT`)
  if (!campaignCols.includes('resub_email_subject')) sqlite.exec(`ALTER TABLE campaigns ADD COLUMN resub_email_subject TEXT`)
  if (!campaignCols.includes('resub_email_message')) sqlite.exec(`ALTER TABLE campaigns ADD COLUMN resub_email_message TEXT`)
  if (!contactCols.includes('sub_change_count'))      sqlite.exec(`ALTER TABLE contacts ADD COLUMN sub_change_count INTEGER DEFAULT 0`)
  if (!contactCols.includes('sub_change_window_start')) sqlite.exec(`ALTER TABLE contacts ADD COLUMN sub_change_window_start INTEGER`)
} catch (err) {
  console.error('Schema migration patch failed:', err)
}

// Recover campaigns stuck in 'sending' after a crash/restart
try {
  sqlite.prepare(
    `UPDATE campaigns SET status = 'paused', finished_at = ? WHERE status = 'sending'`
  ).run(Math.floor(Date.now() / 1000))
  console.log('Recovered any stuck campaigns.')
} catch {
  // Non-fatal — campaigns table may not exist yet on first run
}

export default db

