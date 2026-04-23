import { db } from '~/server/db/index'
import { sends, contacts } from '~/server/db/schema'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, 'id'))

  const rows = await db
    .select({
      id: sends.id,
      email: sends.email,
      status: sends.status,
      sentAt: sends.sentAt,
      errorMsg: sends.errorMsg,
      contactName: contacts.name,
      contactCompany: contacts.company,
    })
    .from(sends)
    .leftJoin(contacts, eq(contacts.id, sends.contactId))
    .where(eq(sends.campaignId, campaignId))
    .orderBy(desc(sends.sentAt))

  return rows
})
