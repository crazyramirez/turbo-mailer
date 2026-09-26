import { existsSync } from 'node:fs'
import { dataPath } from '~/server/utils/data-dir'

export default defineEventHandler(() => ({
  installed: existsSync(dataPath('.installed')),
}))
