import { db } from './server/db/index.js';
import { contacts } from './server/db/schema.js';
import { sanitizeContactFields } from './server/utils/validate.js';

async function test() {
  const body = {
    email: 'test' + Date.now() + '@example.com',
    name: 'Test User',
    company: 'Test Co',
    agency: 'Test Agency', // This should be ignored
    role: 'Tester'
  };
  
  const fields = sanitizeContactFields(body);
  console.log("Sanitized fields:", JSON.stringify(fields, null, 2));
  
  try {
    const [row] = await db.insert(contacts).values({
      ...fields,
      tags: [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    console.log("Insert success:", row.id);
  } catch (e) {
    console.error("Insert failed:", e.message);
  }
  process.exit(0);
}
test();
