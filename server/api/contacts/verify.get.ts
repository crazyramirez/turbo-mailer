import { verifyJobStatus } from '~/server/utils/verify-job'
import { quickVerify, verifyEmail } from '~/server/utils/email-verify'

// Job progress, or ?email=x to check one address on the fly (import preview).
export default defineEventHandler(async (event) => {
  const email = getQuery(event).email
  if (typeof email === 'string' && email) {
    return getQuery(event).quick ? quickVerify(email) : verifyEmail(email)
  }
  return verifyJobStatus()
})
