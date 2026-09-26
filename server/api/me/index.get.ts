import { authOf, getUser, publicUser, multiUserEnabled } from '~/server/utils/users'

export default defineEventHandler((event) => {
  const auth = authOf(event)
  const user = auth.userId !== null ? getUser(auth.userId) : undefined
  return {
    multiUser: multiUserEnabled(),
    role: auth.role,
    user: user ? publicUser(user) : null,
  }
})
