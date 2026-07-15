import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchMembers,
  kickMember,
  unblockBlacklistMember,
} from './client'

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends API key on GET requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await fetchMembers()

    expect(fetch).toHaveBeenCalledWith(
      '/api/members',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': 'test-dashboard-secret',
        }),
      }),
    )
  })

  it('posts kick/unblock with API key', async () => {
    await kickMember(1001)
    await unblockBlacklistMember(55)

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/members/1001/kick',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'test-dashboard-secret',
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/blacklist/55/unblock',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'test-dashboard-secret',
        }),
      }),
    )
  })

  it('throws a readable error on non-OK responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Invalid or missing API key', { status: 401 }),
    )

    await expect(kickMember(1)).rejects.toThrow('HTTP 401: Invalid or missing API key')
  })
})
