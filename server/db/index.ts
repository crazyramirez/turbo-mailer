import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { resolve, join } from 'node:path'
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

// Auto-run migrations on startup
function runMigrations() {
  try {
    let migrationsPath = resolve(process.cwd(), 'server/db/migrations')
    
    if (!import.meta.dev) {
      const prodPaths = [
        resolve(process.cwd(), '.output/server/assets/migrations'),
        resolve(process.cwd(), 'server/assets/migrations'),
        resolve(process.cwd(), 'server/db/migrations'),
      ]
      
      for (const p of prodPaths) {
        if (existsSync(p)) {
          migrationsPath = p
          break
        }
      }
    }

    console.log(`[DB] Checking migrations in: ${migrationsPath}`)
    
    if (!existsSync(migrationsPath)) {
      console.warn(`[DB] Migrations folder not found at ${migrationsPath}. Skipping auto-migration.`)
      return
    }

    migrate(db, { migrationsFolder: migrationsPath })
    console.log('[DB] Database migrations completed successfully.')
  } catch (error) {
    console.error('[DB] Failed to run database migrations:', error)
  }
}

// Run migrations synchronously on startup
runMigrations()

// Recover campaigns stuck in 'sending' after a crash/restart
try {
  sqlite.prepare(
    `UPDATE campaigns SET status = 'paused', finished_at = ? WHERE status = 'sending'`
  ).run(Math.floor(Date.now() / 1000))
  console.log('[DB] Recovered any stuck campaigns.')
} catch {
  // Non-fatal — campaigns table may not exist yet on first run
}

export default db
