import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLocalStorage } from './useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('uses initial value when storage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('page-size', 25))
    expect(result.current[0]).toBe(25)
  })

  it('reads existing JSON value from storage', () => {
    window.localStorage.setItem('theme', JSON.stringify('dark'))
    const { result } = renderHook(() => useLocalStorage('theme', 'light'))
    expect(result.current[0]).toBe('dark')
  })

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('filter', 'all'))

    act(() => {
      result.current[1]('active')
    })

    expect(result.current[0]).toBe('active')
    expect(window.localStorage.getItem('filter')).toBe(JSON.stringify('active'))
  })
})
