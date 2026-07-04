// Vitest setup: provide Nitro auto-imported globals used by server utils.
import { createError } from 'h3'

;(globalThis as any).createError = createError
