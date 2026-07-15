import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useDashboardSocket } from './useDashboardSocket'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  readyState = MockWebSocket.OPEN
  url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.(new Event('open')))
  }

  close() {
    this.onclose?.(new CloseEvent('close'))
  }

  emit(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(data) }),
    )
  }
}

describe('useDashboardSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invalidates member queries on members.changed', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useDashboardSocket(), { wrapper })

    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    MockWebSocket.instances[0].emit({ type: 'members.changed', user_id: 1 })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['members'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inactive-members'] })
    })
  })

  it('invalidates all lists on dashboard.refresh', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useDashboardSocket(), { wrapper })
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    MockWebSocket.instances[0].emit({ type: 'dashboard.refresh' })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['members'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['blacklist'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inactive-members'] })
    })
  })
})
