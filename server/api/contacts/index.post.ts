import { db } from '~/server/db/index'
import { contacts, listContacts } from '~/server/db/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, name, company, phone, linkedin, url, youtube, instagram, tags, listIds } = body

  if (!email?.trim()) throw createError({ statusCode: 400, statusMessage: 'email is required' })

  try {
    const [row] = await db.insert(contacts).values({
      email: email.trim().toLowerCase(),
      name: name?.trim() || null,
      company: company?.trim() || null,
      phone: phone?.trim() || null,
      linkedin: linkedin?.trim() || null,
      url: url?.trim() || null,
      youtube: youtube?.trim() || null,
      instagram: instagram?.trim() || null,
      tags: tags || [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning()

    if (Array.isArray(listIds) && listIds.length) {
      await db.insert(listContacts).values(listIds.map((listId: number) => ({ listId, contactId: row.id })))
    }

    return row
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      throw createError({ statusCode: 409, statusMessage: 'Email already exists' })
    }
    throw e
  }
})
