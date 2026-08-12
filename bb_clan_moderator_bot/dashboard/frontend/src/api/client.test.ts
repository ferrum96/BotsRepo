import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchMembers,
  kickMember,
  setToken,
  unblockBlacklistMember,
} from './client'

const TEST_TOKEN = 'test-jwt-token'

function getFetchCall(index: number) {
  const call = vi.mocked(fetch).mock.calls[index]
  return {
    url: call[0] as string,
    init: call[1] as RequestInit | undefined,
  }
}

function headerValue(init: RequestInit | undefined, name: string) {
  const headers = init?.headers
  if (headers instanceof Headers) {
    return headers.get(name)
  }
  return undefined
}

describe('api client', () => {
  beforeEach(() => {
    setToken(TEST_TOKEN)
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
    setToken(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends Authorization token on GET requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await fetchMembers()

    const { url, init } = getFetchCall(0)
    expect(url).toBe('/api/members')
    expect(init?.headers).toBeInstanceOf(Headers)
    expect(headerValue(init, 'Authorization')).toBe(`Bearer ${TEST_TOKEN}`)
  })

  it('posts kick/unblock with Authorization token', async () => {
    await kickMember(1001)
    await unblockBlacklistMember(55)

    const kickCall = getFetchCall(0)
    expect(kickCall.url).toBe('/api/members/1001/kick')
    expect(kickCall.init?.method).toBe('POST')
    expect(headerValue(kickCall.init, 'Authorization')).toBe(`Bearer ${TEST_TOKEN}`)

    const unblockCall = getFetchCall(1)
    expect(unblockCall.url).toBe('/api/blacklist/55/unblock')
    expect(unblockCall.init?.method).toBe('POST')
    expect(headerValue(unblockCall.init, 'Authorization')).toBe(`Bearer ${TEST_TOKEN}`)
  })

  it('throws a readable error on non-OK responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Server error', { status: 500 }),
    )

    await expect(kickMember(1)).rejects.toThrow('HTTP 500: Server error')
  })
})
