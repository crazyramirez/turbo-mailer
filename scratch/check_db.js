import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data/turbomailer.db');
const db = new Database(dbPath);

const tables = ['campaigns', 'sends', 'tracking_events', 'list_contacts'];
tables.forEach(t => {
  console.log(`--- ${t} schema ---`);
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t);
  console.log(row?.sql);
});

db.close();
