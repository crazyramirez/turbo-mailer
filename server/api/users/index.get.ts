import { sqlite } from '~/server/db/index'
import { publicUser, multiUserEnabled, type UserRow } from '~/server/utils/users'

export default defineEventHandler(() => {
  const rows = sqlite.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[]
  return { multiUser: multiUserEnabled(), users: rows.map(publicUser) }
})
