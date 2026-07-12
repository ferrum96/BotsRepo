const API_BASE = '/api'
const TOKEN_KEY = 'kanban-auth-token'

export type AuthUser = {
  id: string
  username: string
  displayName: string
  avatar: string | null
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

type RequestOptions = RequestInit & {
  skipAuth?: boolean
}

async function request(url: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (!options.skipAuth) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
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

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

const get = (url: string) => request(url)

export const api = {
  auth: {
    login: (data: { username: string; password: string }) =>
      request(`${API_BASE}/auth/login`, {
        method: 'POST',
        body: JSON.stringify(data),
        skipAuth: true,
      }) as Promise<{ token: string; user: AuthUser } | { error: string }>,
    me: () =>
      request(`${API_BASE}/auth/me`) as Promise<{ user: AuthUser }>,
    updateAvatar: (avatar: string | null) =>
      request(`${API_BASE}/auth/avatar`, {
        method: 'PUT',
        body: JSON.stringify({ avatar }),
      }) as Promise<{ user: AuthUser } | { error: string }>,
  },
  users: {
    list: () =>
      get(`${API_BASE}/users`) as Promise<Array<{ id: string; username: string; displayName: string; avatar?: string | null }>>,
  },
  boards: {
    list: () => get(`${API_BASE}/boards`),
    get: (id: string) => get(`${API_BASE}/boards/${id}`),
    create: (data: { name: string }) =>
      request(`${API_BASE}/boards`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name: string }) =>
      request(`${API_BASE}/boards/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`${API_BASE}/boards/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    create: (boardId: string, data: any) =>
      request(`${API_BASE}/${boardId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`${API_BASE}/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`${API_BASE}/tasks/${id}`, { method: 'DELETE' }),
    move: (id: string, data: any) =>
      request(`${API_BASE}/tasks/${id}/move`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
  columns: {
    create: (boardId: string, data: any) =>
      request(`${API_BASE}/${boardId}/columns`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`${API_BASE}/columns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`${API_BASE}/columns/${id}`, { method: 'DELETE' }),
  },
  epics: {
    create: (boardId: string, data: any) =>
      request(`${API_BASE}/${boardId}/epics`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`${API_BASE}/epics/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`${API_BASE}/epics/${id}`, { method: 'DELETE' }),
  },
  labels: {
    create: (boardId: string, data: any) =>
      request(`${API_BASE}/${boardId}/labels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request(`${API_BASE}/labels/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request(`${API_BASE}/labels/${id}`, { method: 'DELETE' }),
  },
}
