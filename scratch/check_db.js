import Database from 'better-sqlite3';
const db = new Database('./data/turbomailer.db');
const columns = db.prepare("PRAGMA table_info(contacts)").all();
console.log(JSON.stringify(columns, null, 2));
db.close();
