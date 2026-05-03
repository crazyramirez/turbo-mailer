import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineEventHandler(() => ({
  installed: existsSync(resolve(process.cwd(), 'data/.installed')),
}))
