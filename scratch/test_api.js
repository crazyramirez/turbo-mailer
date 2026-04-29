// Since I can't easily fetch from the running server, I'll mock the event and call the handler directly if possible,
// but it's easier to just run a script that simulates the query logic from index.get.ts exactly.
import { db } from './server/db/index.js';
import { contacts } from './server/db/schema.js';
import { sql } from 'drizzle-orm';

async function test() {
  try {
    const rows = await db.select().from(contacts).limit(50);
    console.log("Contacts rows:", rows.length);
    console.log("First row:", JSON.stringify(rows[0], null, 2));
  } catch (e) {
    console.error("Error fetching contacts:", e.message);
  }
  process.exit(0);
}
test();
