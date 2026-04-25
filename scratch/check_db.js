import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'data', 'turbomailer.db');
try {
  const db = new Database(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log(JSON.stringify(tables));
  db.close();
} catch (e) {
  console.error(e);
}
