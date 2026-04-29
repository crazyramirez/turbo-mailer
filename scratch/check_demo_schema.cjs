const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'turbomailer_demo.db');
console.log('Opening:', dbPath);
const db = new Database(dbPath);
const info = db.pragma('table_info(contacts)');
console.log(JSON.stringify(info, null, 2));
db.close();
