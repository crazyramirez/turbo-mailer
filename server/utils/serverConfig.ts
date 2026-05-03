import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

let _cache: Record<string, any> | null = null

function getFileConfig(): Record<string, any> {
  if (_cache) return _cache
  const p = resolve(process.cwd(), 'data/config.json')
  _cache = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any>) : {}
  return _cache
}

export function invalidateServerConfig(): void {
  _cache = null
}

export function useServerConfig() {
  const rc = useRuntimeConfig() as Record<string, any>
  const fc = getFileConfig()
  return new Proxy(rc, {
    get(target, prop: string) {
      const v = fc[prop]
      if (v !== undefined && v !== null && v !== '') return v
      return Reflect.get(target, prop)
    },
  })
}
