// Shared bootstrap for integration tests: an isolated SQLite database in a
// temp DATA_DIR (never the real data/turbomailer.db) with all migrations
// applied, plus the Nitro auto-imported globals server code expects.
//
// Must be imported via vi.hoisted() BEFORE any server module, because the DB
// module opens the database at import time.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export function bootIsolatedEnv(config: Record<string, any> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-test-'))
  process.env.DATA_DIR = dir
  process.env.TM_MIGRATIONS_DIR = resolve(__dirname, '../../server/db/migrations')
  const cfg: Record<string, any> = {
    smtpHost: 'smtp.test.local',
    smtpPort: 587,
    smtpUser: 'sender@example.com',
    smtpPass: 'x',
    smtpSecure: false,
    smtpFromName: 'Test Sender',
    smtpFromEmail: 'sender@example.com',
    trackingBaseUrl: 'https://mail.example.com',
    unsubscribeSecret: 'test-secret-0123456789abcdef',
    smtpSendDelayMs: 0,
    smtpSendJitterMs: 0,
    smtpMaxRetries: 3,
    imapAutoDetect: false,
    ...config,
  }
  ;(globalThis as any).useServerConfig = () => cfg
  return { dir, cfg }
}
