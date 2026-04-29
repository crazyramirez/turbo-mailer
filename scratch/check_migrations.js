import Database from 'better-sqlite3';
const db = new Database('./data/turbomailer.db');
try {
  const migrations = db.prepare("SELECT * FROM __drizzle_migrations").all();
  console.log(JSON.stringify(migrations, null, 2));
} catch (e) {
  console.log("No __drizzle_migrations table found or error:", e.message);
}
db.close();
