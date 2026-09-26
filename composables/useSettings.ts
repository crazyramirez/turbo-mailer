// Shared state for the Settings screen: one load, per-tab saves.

interface SettingsPayload {
  settings: Record<string, any>
  senders: any[]
  imap: { host: string; user: string } | null
  env: { encryptionKeySet: boolean; dataDir: string | null; version: string; node: string }
}

const data = ref<SettingsPayload | null>(null)
const loading = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    data.value = await $fetch<SettingsPayload>('/api/settings')
  } finally {
    loading.value = false
  }
}

/** Saves a patch; returns true on success (errors are toasted). */
async function save(patch: Record<string, unknown>): Promise<boolean> {
  const { showToast } = useDashboardState()
  saving.value = true
  try {
    const res = await $fetch<{ settings: Record<string, any> }>('/api/settings', { method: 'PUT', body: patch })
    if (data.value) data.value.settings = res.settings
    showToast(useNuxtApp().$i18n.t('settings.saved'), 'success')
    return true
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e?.message || 'Error', 'error')
    return false
  } finally {
    saving.value = false
  }
}

/** Editable copy of some keys (secrets come back as { set } → blank field). */
function draftOf(keys: string[]): Record<string, any> {
  const s = data.value?.settings ?? {}
  const out: Record<string, any> = {}
  for (const k of keys) {
    const v = s[k]
    out[k] = v && typeof v === 'object' && 'set' in v ? '' : v ?? ''
  }
  return out
}

function isSecretSet(key: string): boolean {
  const v = data.value?.settings?.[key]
  return !!(v && typeof v === 'object' && v.set)
}

export function useSettings() {
  return { data, loading, saving, load, save, draftOf, isSecretSet }
}
