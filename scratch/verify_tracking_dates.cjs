const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, '../data/turbomailer.db'), { readonly: true })

const rows = db.prepare(`
  SELECT event_type,
         date(created_at, 'unixepoch') as d,
         count(*) as n
  FROM tracking_events
  GROUP BY event_type, d
  ORDER BY d
`).all()
console.log('tracking events by date:', JSON.stringify(rows, null, 2))

const now = Math.floor(Date.now() / 1000)
const fromTs = now - 30 * 86400
console.log('\n30-day range from:', new Date(fromTs * 1000).toISOString().slice(0, 10), 'to:', new Date(now * 1000).toISOString().slice(0, 10))

const inRange = db.prepare(`
  SELECT event_type, count(*) as n
  FROM tracking_events
  WHERE created_at >= ${fromTs}
  GROUP BY event_type
`).all()
console.log('events within 30-day range:', JSON.stringify(inRange))

db.close()
