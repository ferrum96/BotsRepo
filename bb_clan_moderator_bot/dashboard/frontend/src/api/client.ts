const API_BASE = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'bb-clan-dashboard-token'

export type AuthUser = {
  id: number
  username: string
  display_name: string
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore Safari private mode storage errors.
  }
}

export interface Member {
  user_id: number
  tg_username: string | null
  tg_first_name: string | null
  game_nick: string
  real_name: string
  discord_nick: string | null
  perspective: string
  join_date: string
  is_removed: boolean
}

export interface MemberUpdate {
  game_nick: string
  real_name: string
  discord_nick: string | null
  perspective: string
}

export interface BlacklistEntry {
  user_id: number
  tg_username: string | null
  game_nick: string | null
  real_name: string | null
  discord_nick: string | null
  reason: string
  created_at: string
}

export interface InactiveMember {
  user_id: number
  tg_username: string | null
  game_nick: string
  real_name: string
  discord_nick: string | null
  last_match_at: string | null
  last_match_checked_at: string | null
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (!options.skipAuth) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  })

  if (response.status === 401 && !options.skipAuth) {
    setToken(null)
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
    throw new Error('Unauthorized')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  return response.json()
}

export const fetchMembers = () => request<Member[]>('/api/members')

export const fetchBlacklist = () => request<BlacklistEntry[]>('/api/blacklist')

export const fetchInactiveMembers = () => request<InactiveMember[]>('/api/inactive-members')

export const kickMember = (userId: number) =>
  request<{ ok: boolean }>(`/api/members/${userId}/kick`, {
    method: 'POST',
  })

export const updateMember = (userId: number, payload: MemberUpdate) =>
  request<Member>(`/api/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const unblockBlacklistMember = (userId: number) =>
  request<{ ok: boolean }>(`/api/blacklist/${userId}/unblock`, {
    method: 'POST',
  })

export const login = (username: string, password: string) =>
  request<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    skipAuth: true,
  })

export const me = () => request<{ user: AuthUser }>('/api/auth/me')
