import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as schema from './schema'

const dbPath = resolve(process.cwd(), 'data', 'turbomailer.db')

// Ensure data directory exists
mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })

const sqlite = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Auto-create tables on first run
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    company TEXT,
    phone TEXT,
    linkedin TEXT,
    url TEXT,
    youtube TEXT,
    instagram TEXT,
    tags TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed','bounced')),
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS list_contacts (
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, contact_id)
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    template_name TEXT,
    template_html TEXT,
    list_id INTEGER REFERENCES lists(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','paused')),
    scheduled_at INTEGER,
    started_at INTEGER,
    finished_at INTEGER,
    created_at INTEGER,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id),
    email TEXT NOT NULL,
    personalized_subject TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','bounced','opened')),
    sent_at INTEGER,
    error_msg TEXT
  );

  CREATE TABLE IF NOT EXISTS tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    send_id INTEGER REFERENCES sends(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    contact_id INTEGER REFERENCES contacts(id),
    event_type TEXT NOT NULL CHECK(event_type IN ('open','click')),
    url TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER
  );
`)

// Migration: add 'opened' to sends.status CHECK constraint if not present
const sendsSchema = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sends'").get() as any)?.sql ?? ''
if (!sendsSchema.includes("'opened'")) {
  sqlite.pragma('foreign_keys = OFF')
  sqlite.exec(`
    BEGIN;
    ALTER TABLE sends RENAME TO sends_old;
    CREATE TABLE sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id),
      email TEXT NOT NULL,
      personalized_subject TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','bounced','opened')),
      sent_at INTEGER,
      error_msg TEXT
    );
    INSERT INTO sends SELECT * FROM sends_old;
    DROP TABLE sends_old;
    COMMIT;
  `)
  sqlite.pragma('foreign_keys = ON')
}

// Migration: fix tracking_events FK broken by sends rename migration
const brokenTrigger = (sqlite.prepare(
  "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='tracking_events' AND sql LIKE '%sends_old%'"
).get() as any)?.n ?? 0
if (brokenTrigger > 0) {
  sqlite.pragma('foreign_keys = OFF')
  sqlite.exec(`
    BEGIN;
    ALTER TABLE tracking_events RENAME TO tracking_events_old;
    CREATE TABLE tracking_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      send_id INTEGER REFERENCES sends(id),
      campaign_id INTEGER REFERENCES campaigns(id),
      contact_id INTEGER REFERENCES contacts(id),
      event_type TEXT NOT NULL CHECK(event_type IN ('open','click')),
      url TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER
    );
    INSERT INTO tracking_events SELECT * FROM tracking_events_old;
    DROP TABLE tracking_events_old;
    COMMIT;
  `)
  sqlite.pragma('foreign_keys = ON')
}

export default db
