import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  BLACKLIST_KEY,
  INACTIVE_KEY,
  MEMBERS_KEY,
  invalidateKeys,
} from '../utils/queryKeys'

const API_BASE = import.meta.env.VITE_API_URL || ''
const API_KEY = import.meta.env.VITE_DASHBOARD_API_KEY || ''

function buildWsUrl(): string {
  const tokenQS = API_KEY ? `?token=${encodeURIComponent(API_KEY)}` : ''
  if (API_BASE) {
    const url = new URL(API_BASE)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/ws'
    url.search = ''
    return `${url.toString().replace(/\/$/, '')}${tokenQS}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws${tokenQS}`
}

function invalidateForEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  type: string,
) {
  if (type === 'members.changed') {
    invalidateKeys(queryClient, MEMBERS_KEY, INACTIVE_KEY)
    return
  }
  if (type === 'blacklist.changed') {
    invalidateKeys(queryClient, BLACKLIST_KEY, MEMBERS_KEY)
    return
  }
  if (type === 'inactive.changed') {
    invalidateKeys(queryClient, INACTIVE_KEY, MEMBERS_KEY)
    return
  }
  // dashboard.refresh / unknown
  if (type === 'connected') return
  invalidateKeys(queryClient, MEMBERS_KEY, BLACKLIST_KEY, INACTIVE_KEY)
}

/** Subscribe to live dashboard events from the API WebSocket. */
export function useDashboardSocket() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let socket: WebSocket | null = null
    let closed = false
    let retryMs = 1000
    let retryTimer: number | undefined

    const scheduleReconnect = () => {
      if (closed || retryTimer !== undefined) return
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined
        retryMs = Math.min(retryMs * 2, 15000)
        connect()
      }, retryMs)
    }

    const connect = () => {
      if (closed) return
      const url = buildWsUrl()
      socket = new WebSocket(url)

      socket.onopen = () => {
        retryMs = 1000
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { type?: string }
          if (data?.type) {
            invalidateForEvent(queryClient, data.type)
          }
        } catch {
          // ignore malformed payloads
        }
      }

      socket.onclose = () => {
        scheduleReconnect()
      }

      // Browser fires onclose after onerror; reconnect only from onclose.
      socket.onerror = () => {}
    }

    connect()

    return () => {
      closed = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      socket?.close()
    }
  }, [queryClient])
}
