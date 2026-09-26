// Current account + role, shared by every screen that hides admin-only UI.

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

interface MePayload {
  multiUser: boolean
  role: Role
  user: {
    id: number
    email: string
    name: string | null
    role: Role
    totpEnabled: boolean
    recoveryCodesLeft: number
  } | null
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }

export function useMe() {
  const me = useState<MePayload | null>('me', () => null)

  async function refresh(): Promise<MePayload | null> {
    try {
      me.value = await $fetch<MePayload>('/api/me')
    } catch {
      me.value = null
    }
    return me.value
  }

  /** Legacy single-password sessions act as owner. */
  const role = computed<Role>(() => me.value?.role ?? 'owner')
  const can = (min: Role) => RANK[role.value] >= RANK[min]

  return { me, role, can, refresh }
}

/** Store a refresh token handed back after a credential change. */
export function storeRefreshToken(token: string | undefined | null) {
  if (token && typeof localStorage !== 'undefined') localStorage.setItem('tm_refresh_token', token)
}
