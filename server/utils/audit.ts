import { db } from '~/server/db/index'
import { auditLog } from '~/server/db/schema'

export function logAudit(action: string, detail?: Record<string, unknown>, ip?: string) {
  db.insert(auditLog).values({ action, detail: detail ?? {}, ip }).catch(() => {})
}
