import Database from 'better-sqlite3';
const db = new Database('./data/turbomailer.db');
const count = db.prepare("SELECT count(*) as count FROM contacts").get();
console.log("Contacts count:", count.count);
const sample = db.prepare("SELECT * FROM contacts LIMIT 1").get();
console.log("Sample contact:", JSON.stringify(sample, null, 2));
db.close();
