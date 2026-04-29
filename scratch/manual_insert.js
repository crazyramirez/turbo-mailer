import Database from 'better-sqlite3';
const db = new Database('./data/turbomailer.db');
try {
  const result = db.prepare(`
    INSERT INTO contacts (email, name, company, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('manual-test' + Date.now() + '@test.com', 'Test', 'Co', 'Dev', 'active', Date.now(), Date.now());
  console.log("Manual insert success:", result.lastInsertRowid);
} catch (e) {
  console.error("Manual insert failed:", e.message);
}
db.close();
