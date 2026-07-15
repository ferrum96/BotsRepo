const API_BASE = import.meta.env.VITE_API_URL || ''
const API_KEY = import.meta.env.VITE_DASHBOARD_API_KEY || ''

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  }
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  return response.json()
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

export const fetchMembers = () => fetchJson<Member[]>('/api/members')

export const fetchBlacklist = () => fetchJson<BlacklistEntry[]>('/api/blacklist')

export const fetchInactiveMembers = () => fetchJson<InactiveMember[]>('/api/inactive-members')

export const kickMember = (userId: number) =>
  fetchJson<{ ok: boolean }>(`/api/members/${userId}/kick`, {
    method: 'POST',
  })

export const updateMember = (userId: number, payload: MemberUpdate) =>
  fetchJson<Member>(`/api/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const unblockBlacklistMember = (userId: number) =>
  fetchJson<{ ok: boolean }>(`/api/blacklist/${userId}/unblock`, {
    method: 'POST',
  })
