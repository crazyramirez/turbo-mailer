import { db } from '~/server/db/index'
import { listContacts } from '~/server/db/schema'

export default defineEventHandler(async (event) => {
  const listId = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const { contactId, contactIds } = body

  const ids: number[] = contactIds
    ? contactIds.map(Number)
    : contactId
      ? [Number(contactId)]
      : []

  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'contactId or contactIds required' })

  await db.insert(listContacts)
    .values(ids.map(cid => ({ listId, contactId: cid })))
    .onConflictDoNothing()

  return { assigned: ids.length }
})
