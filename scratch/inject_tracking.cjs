const Database = require('better-sqlite3')
const path = require('path')

const mainPath = path.join(__dirname, '../data/turbomailer.db')
const demoPath = path.join(__dirname, '../data/turbomailer_demo.db').replace(/\\/g, '/')

const db = new Database(mainPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = OFF')
db.exec(`ATTACH DATABASE '${demoPath}' AS demo`)

const demoCols = db.pragma('demo.table_info("tracking_events")').map(c => c.name)
const mainCols = db.pragma('main.table_info("tracking_events")').map(c => c.name)
const common = demoCols.filter(c => mainCols.includes(c))
const colList = common.map(c => `"${c}"`).join(', ')

db.prepare('DELETE FROM main.tracking_events').run()
db.exec(`INSERT INTO main.tracking_events (${colList}) SELECT ${colList} FROM demo.tracking_events`)

const count = db.prepare('SELECT COUNT(*) as n FROM main.tracking_events').get()
console.log('tracking_events inserted:', count.n)

const sample = db.prepare('SELECT event_type, count(*) as n FROM main.tracking_events GROUP BY event_type').all()
console.log('by type:', JSON.stringify(sample))

db.exec('DETACH DATABASE demo')
db.pragma('foreign_keys = ON')
db.close()
console.log('Done.')
