import { db } from '~/server/db/index'
import { campaigns, sends, trackingEvents } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  // Manual cleanup to ensure deletion works even if foreign key cascades are missing in the DB
  try {
    await db.delete(trackingEvents).where(eq(trackingEvents.campaignId, id))
    await db.delete(sends).where(eq(sends.campaignId, id))
    await db.delete(campaigns).where(eq(campaigns.id, id))
    return { success: true }
  } catch (err: any) {
    console.error(`[campaign-delete] Error deleting campaign ${id}:`, err)
    throw createError({
      statusCode: 500,
      statusMessage: `Error deleting campaign: ${err.message}`
    })
  }
})
