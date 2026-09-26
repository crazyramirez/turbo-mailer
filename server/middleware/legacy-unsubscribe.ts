import { handleUnsubscribePost } from '~/server/utils/one-click'

// Emails sent before the one-click fix carry List-Unsubscribe pointing at the
// /unsubscribe PAGE. Gmail/Yahoo POST there; the SPA renderer used to answer
// 200 with HTML — the provider told the user "unsubscribed" while nothing
// happened. Intercept those POSTs and honour them.
export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') return
  const path = getRequestURL(event).pathname
  if (path !== '/unsubscribe' && path !== '/unsubscribe/') return
  return handleUnsubscribePost(event)
})
