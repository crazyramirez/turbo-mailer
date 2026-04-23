import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { email, name, company, phone, linkedin, url, youtube, instagram, tags, status, listIds } = body

  const [row] = await db.update(contacts).set({
    email: email?.trim().toLowerCase(),
    name: name?.trim() || null,
    company: company?.trim() || null,
    phone: phone?.trim() || null,
    linkedin: linkedin?.trim() || null,
    url: url?.trim() || null,
    youtube: youtube?.trim() || null,
    instagram: instagram?.trim() || null,
    tags: tags || [],
    status: status || 'active',
    updatedAt: new Date(),
  }).where(eq(contacts.id, id)).returning()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  if (Array.isArray(listIds)) {
    await db.delete(listContacts).where(eq(listContacts.contactId, id))
    if (listIds.length) {
      await db.insert(listContacts).values(listIds.map((listId: number) => ({ listId, contactId: id })))
    }
  }

  return row
})
