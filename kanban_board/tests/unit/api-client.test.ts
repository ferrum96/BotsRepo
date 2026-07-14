import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, setToken } from '../../src/client/lib/api.js'

describe('api client auth headers', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'board-1', name: 'New Board' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends Authorization Bearer when creating a board', async () => {
    setToken('test-jwt-token')

    await api.boards.create({ name: 'New Board' })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/boards')
    expect(options?.method).toBe('POST')

    const headers = options?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-jwt-token')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(options?.body).toBe(JSON.stringify({ name: 'New Board' }))
  })

  it('omits Authorization when token is missing', async () => {
    setToken(null)

    await api.boards.create({ name: 'No Auth Board' })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const headers = options?.headers as Headers
    expect(headers.get('Authorization')).toBeNull()
  })

  it('clears token and redirects to login on 401', async () => {
    setToken('expired-token')
    const assign = vi.fn()
    vi.stubGlobal('window', {
      location: { pathname: '/boards', assign },
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(api.boards.create({ name: 'Fail Board' })).rejects.toThrow('Unauthorized')
    expect(store.has('kanban-auth-token')).toBe(false)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('sends avatar payload with Authorization on updateAvatar', async () => {
    setToken('avatar-token')
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        user: {
          id: 'u1',
          username: 'ivan',
          displayName: 'Ivan',
          avatar: 'data:image/png;base64,abc',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await api.auth.updateAvatar('data:image/png;base64,abc')

    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/auth/avatar')
    expect(options?.method).toBe('PUT')
    const headers = options?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer avatar-token')
    expect(options?.body).toBe(JSON.stringify({ avatar: 'data:image/png;base64,abc' }))
  })
})
