import es from '~/i18n/locales/es.json'
import en from '~/i18n/locales/en.json'

const locales: Record<string, Record<string, any>> = { es, en }

export function emailT(lang: string, path: string, vars?: Record<string, string>): string {
  const locale = locales[lang] ?? locales['es']
  const keys = path.split('.')
  let val: any = locale
  for (const k of keys) val = val?.[k]
  let str = typeof val === 'string' ? val : path
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v)
    }
  }
  return str
}
