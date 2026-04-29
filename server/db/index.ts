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

export { sqlite }

// Auto-run migrations on startup
try {
  console.log('Checking database migrations...')
  migrate(db, { migrationsFolder: migrationsPath })
  console.log('Database migrations completed successfully.')
} catch (error) {
  console.error('Failed to run database migrations:', error)
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
