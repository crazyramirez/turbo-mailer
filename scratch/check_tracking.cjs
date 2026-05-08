const Database = require('better-sqlite3')
const path = require('path')

const demoPath = path.join(__dirname, '../data/turbomailer_demo.db')
const db = new Database(':memory:')
db.exec('PRAGMA journal_mode=WAL')
const normPath = demoPath.replace(/\\/g, '/')
db.exec(`ATTACH DATABASE '${normPath}' AS demo`)

const cols = db.pragma('demo.table_info("tracking_events")')
console.log('pragma cols count:', cols.length)
if (cols.length) console.log('cols:', cols.map(c => c.name).join(', '))

const count = db.prepare('SELECT COUNT(*) as n FROM demo.tracking_events').get()
console.log('tracking_events rows in demo.db:', count.n)

const sample = db.prepare('SELECT id, event_type, created_at FROM demo.tracking_events LIMIT 5').all()
console.log('sample rows:', JSON.stringify(sample))

db.exec('DETACH DATABASE demo')
db.close()
