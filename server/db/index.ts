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

// Auto-run migrations on startup
try {
  console.log('Checking database migrations...')
  
  // Check if we have tables but no migration table (transition from manual)
  const hasTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'").get()
  const hasMigrationTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get()
  
  if (hasTables && !hasMigrationTable) {
    console.log('Legacy database detected. Skipping initial migration to avoid conflicts.')
    // We could manually seed the migration table here, but skipping is safer 
    // if the schema matches the initial migration.
  } else {
    migrate(db, { migrationsFolder: migrationsPath })
    console.log('Database migrations completed successfully.')
  }
} catch (error) {
  console.error('Failed to run database migrations:', error)
}

export default db

