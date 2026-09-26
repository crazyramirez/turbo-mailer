import { resolve } from 'node:path'

// Writable runtime data (database, config.json, templates, backups...).
// DATA_DIR relocates all of it — e.g. a Docker volume — while the shipped
// demo assets keep living next to the app in ./data/demo.
export const dataDir = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(process.cwd(), 'data')

export function dataPath(...segments: string[]): string {
  return resolve(dataDir, ...segments)
}
