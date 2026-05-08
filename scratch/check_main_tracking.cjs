const Database = require('better-sqlite3')
const path = require('path')

const mainPath = path.join(__dirname, '../data/turbomailer.db')
const db = new Database(mainPath, { readonly: true })

const count = db.prepare('SELECT COUNT(*) as n FROM tracking_events').get()
console.log('tracking_events in main.db:', count.n)

if (count.n > 0) {
  const sample = db.prepare('SELECT id, event_type, created_at FROM tracking_events LIMIT 5').all()
  console.log('sample:', JSON.stringify(sample))
} else {
  // Check if table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  console.log('tables:', tables.map(t => t.name).join(', '))
}

db.close()
