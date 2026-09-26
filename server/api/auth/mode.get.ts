import { multiUserEnabled } from '~/server/utils/users'

// Tells the login screen whether to ask for an email (team accounts) or
// only the access password (single-user install).
export default defineEventHandler(() => ({ multiUser: multiUserEnabled() }))
