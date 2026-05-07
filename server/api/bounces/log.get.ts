import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dataDir } from '~/server/utils/serverConfig'

export default defineEventHandler(() => {
  const logPath = resolve(dataDir, 'bounce.log')
  if (!existsSync(logPath)) return { lines: [] }

  const text = readFileSync(logPath, 'utf-8')
  const lines = text.trim().split('\n').filter(Boolean)
  // Return last 100 lines
  return { lines: lines.slice(-100) }
})
