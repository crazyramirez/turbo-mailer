import { db } from '~/server/db/index'
import { auditLog } from '~/server/db/schema'
import type { AuthContext } from '~/server/utils/users'

// Who did it: taken from the current request (Nitro async context), so every
// existing logAudit() call is attributed without threading the event through.
function currentActor(): AuthContext | null {
  try {
    return (useEvent().context.auth as AuthContext | undefined) ?? null
  } catch {
    // Outside a request (scheduler, send engine after the request ended, tests)
    return null
  }
}

export function logAudit(action: string, detail?: Record<string, unknown>, ip?: string) {
  const actor = currentActor()
  db.insert(auditLog).values({
    action,
    detail: detail ?? {},
    ip,
    userId: actor?.userId ?? null,
    userEmail: actor?.email ?? null,
  }).catch(() => {})
}
