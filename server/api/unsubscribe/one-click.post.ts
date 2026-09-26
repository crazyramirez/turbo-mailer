import { handleUnsubscribePost } from '~/server/utils/one-click'

// RFC 8058 one-click unsubscribe target (List-Unsubscribe header) and the
// unsubscribe page's confirm button. Mailbox providers POST here with
// "List-Unsubscribe=One-Click" and expect a 2xx with no further interaction.
export default defineEventHandler(event => handleUnsubscribePost(event))
