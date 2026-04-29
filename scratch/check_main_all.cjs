const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'turbomailer.db');
const db = new Database(dbPath);

const tables = ['contacts', 'lists', 'campaigns', 'list_contacts', 'sends', 'tracking_events', 'settings'];
const result = {};

for (const table of tables) {
    try {
        result[table] = db.pragma(`table_info(${table})`).map(c => c.name);
    } catch (e) {
        result[table] = 'ERROR';
    }
}

console.log(JSON.stringify(result, null, 2));
db.close();
