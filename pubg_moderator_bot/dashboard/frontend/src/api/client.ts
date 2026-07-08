const API_BASE = import.meta.env.VITE_API_URL || ''
const API_KEY = import.meta.env.VITE_DASHBOARD_API_KEY || ''

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
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

export interface BlacklistEntry {
  user_id: number
  game_nick: string | null
  real_name: string | null
  created_at: string
}

export interface Stats {
  total_members: number
  total_blacklist: number
  perspective_stats: Record<string, number>
}

export const fetchMembers = () => fetchJson<Member[]>('/api/members')

export const fetchBlacklist = () => fetchJson<BlacklistEntry[]>('/api/blacklist')

export const fetchStats = () => fetchJson<Stats>('/api/stats')

export const setMemberLegacy = (userId: number, isLegacy: boolean) =>
  fetchJson<{ ok: boolean }>(`/api/members/${userId}/legacy`, {
    method: 'POST',
    body: JSON.stringify({ is_legacy: isLegacy }),
  })

export const kickMember = (userId: number) =>
  fetchJson<{ ok: boolean }>(`/api/members/${userId}/kick`, {
    method: 'POST',
  })
