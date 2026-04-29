import { db } from './server/db/index.js';
import { contacts } from './server/db/schema.js';
import { sql } from 'drizzle-orm';

async function test() {
  try {
    const all = await db.select().from(contacts);
    console.log("Total contacts in DB:", all.length);
    if (all.length > 0) {
      console.log("First contact sample:", JSON.stringify(all[0], null, 2));
    }
    
    const countResult = await db.select({ count: sql`COUNT(*)` }).from(contacts);
    console.log("Count result:", JSON.stringify(countResult));
  } catch (e) {
    console.error("Error during test:", e);
  }
  process.exit(0);
}
test();
