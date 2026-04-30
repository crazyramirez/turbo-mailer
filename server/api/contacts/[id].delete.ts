import { db } from '~/server/db/index'
import { contacts, sends } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  
  // Manually unlink sends to avoid FOREIGN KEY constraint error
  // This preserves the send history (which has the email) while allowing contact deletion
  await db.update(sends).set({ contactId: null }).where(eq(sends.contactId, id))
  
  await db.delete(contacts).where(eq(contacts.id, id))
  return { success: true }
})
